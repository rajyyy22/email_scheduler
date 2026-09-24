import { Worker, Job } from 'bullmq';
import { prisma } from '../infrastructure/database/prisma.js';
import { SenderService } from '../modules/senders/sender.service.js';
import { emailIndexQueue } from '../queue/queues/queue-factory.js';
import {
  QUEUE_NAMES,
  JOB_NAMES,
  type EmailSendJobV1,
} from '../queue/contracts/job-contracts.js';
import { env } from '../config/env.js';
import { SmtpDispatcherService } from '../services/smtp-dispatcher.service.js';
import { RetrySchedulerService } from '../services/retry-scheduler.service.js';
import { AttemptStatus, EmailStatus } from '../types/index.js';

export function createEmailSendWorker(workerId: string) {
  return new Worker<EmailSendJobV1>(
    QUEUE_NAMES.EMAIL_SEND,
    async (job: Job<EmailSendJobV1>) => {
      const { emailId, campaignId, senderId, recipientEmail, attemptNo } = job.data;

      // 1. Check current DB state
      const existingEmail = await prisma.email.findUnique({
        where: { id: emailId },
      });

      if (!existingEmail) {
        return;
      }

      if (existingEmail.status === EmailStatus.SENT) {
        // Idempotent: already sent, no-op
        return;
      }

      // 2. ATOMIC CLAIM in MySQL: only proceed if status is currently SCHEDULED
      const claimResult = await prisma.email.updateMany({
        where: {
          id: emailId,
          status: EmailStatus.SCHEDULED,
        },
        data: {
          status: EmailStatus.SENDING,
          lockedAt: new Date(),
          lockedBy: workerId,
        },
      });

      if (claimResult.count === 0) {
        // Lost race to another worker or email was cancelled/failed
        return;
      }

      // Update attempt status to SENDING
      await prisma.emailAttempt.updateMany({
        where: {
          emailId,
          attemptNumber: attemptNo,
        },
        data: {
          status: AttemptStatus.SENDING,
          startedAt: new Date(),
        },
      });

      // 3. Fetch Campaign and decrypted Sender credentials
      const [campaign, sender] = await Promise.all([
        prisma.campaign.findUnique({ where: { id: campaignId } }),
        SenderService.getDecryptedSenderCredentials(senderId),
      ]);

      if (!campaign || !sender) {
        throw new Error(`Data missing for email: ${emailId}`);
      }

      // 4. Send email via Nodemailer to Ethereal fake SMTP
      const sendResult = await SmtpDispatcherService.sendMail(
        senderId,
        {
          host: sender.smtpHost,
          port: sender.smtpPort,
          secure: sender.smtpSecure,
          user: sender.smtpUsername,
          pass: sender.smtpPassword,
          fromName: sender.fromName,
          fromEmail: sender.fromEmail,
        },
        {
          to: recipientEmail,
          subject: campaign.subject,
          body: campaign.body,
        },
      );

      const now = new Date();

      // 5. Handle Outcome
      if (sendResult.success) {
        // SUCCESS
        await prisma.$transaction([
          prisma.emailAttempt.updateMany({
            where: { emailId, attemptNumber: attemptNo },
            data: {
              status: AttemptStatus.SENT,
              finishedAt: now,
              smtpMessageId: sendResult.messageId || null,
            },
          }),
          prisma.email.update({
            where: { id: emailId },
            data: {
              status: EmailStatus.SENT,
              sentAt: now,
              providerMessageId: sendResult.messageId || null,
              previewUrl: sendResult.previewUrl || null,
            },
          }),
          prisma.campaign.update({
            where: { id: campaignId },
            data: { sentCount: { increment: 1 } },
          }),
        ]);

        // Enqueue Elasticsearch indexing
        await emailIndexQueue.add(
          JOB_NAMES.EMAIL_INDEX,
          { version: 1, emailId, operation: 'upsert' },
          { jobId: `email-index-${emailId}-sent` },
        );
      } else {
        const error = sendResult.error!;

        // Update Attempt with failure details
        await prisma.emailAttempt.updateMany({
          where: { emailId, attemptNumber: attemptNo },
          data: {
            status: AttemptStatus.FAILED,
            finishedAt: now,
            errorCode: error.code,
            errorMessage: error.message,
          },
        });

        if (error.classification === 'TRANSIENT') {
          // Attempt retry if under threshold
          const scheduled = await RetrySchedulerService.scheduleRetry(
            emailId,
            campaignId,
            senderId,
            attemptNo,
          );

          if (!scheduled) {
            // Reached maximum retry count
            await prisma.email.update({
              where: { id: emailId },
              data: {
                status: EmailStatus.FAILED,
                failedAt: now,
                lastErrorCode: error.code,
                lastErrorMessage: error.message,
                lastErrorAt: now,
              },
            });
            await prisma.campaign.update({
              where: { id: campaignId },
              data: { failedCount: { increment: 1 } },
            });
            await emailIndexQueue.add(
              JOB_NAMES.EMAIL_INDEX,
              { version: 1, emailId, operation: 'upsert' },
              { jobId: `email-index-${emailId}-failed` },
            );
          }
        } else {
          // PERMANENT or UNKNOWN failure: terminate
          await prisma.email.update({
            where: { id: emailId },
            data: {
              status: EmailStatus.FAILED,
              failedAt: now,
              lastErrorCode: error.code,
              lastErrorMessage: error.message,
              lastErrorAt: now,
            },
          });
          await prisma.campaign.update({
            where: { id: campaignId },
            data: { failedCount: { increment: 1 } },
          });
          await emailIndexQueue.add(
            JOB_NAMES.EMAIL_INDEX,
            { version: 1, emailId, operation: 'upsert' },
            { jobId: `email-index-${emailId}-failed` },
          );
        }
      }
    },
    {
      connection: { url: env.REDIS_URL },
      concurrency: env.EMAIL_WORKER_CONCURRENCY,
    },
  );
}
