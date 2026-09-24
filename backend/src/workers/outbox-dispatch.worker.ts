import { Worker, Job } from 'bullmq';
import { prisma } from '../infrastructure/database/prisma.js';
import { RateLimiterService } from '../infrastructure/redis/rate-limiter.service.js';
import {
  emailSendQueue,
  slackNotificationQueue,
} from '../queue/queues/queue-factory.js';
import {
  QUEUE_NAMES,
  JOB_NAMES,
  type OutboxDispatchJobV1,
} from '../queue/contracts/job-contracts.js';
import { env } from '../config/env.js';
import {
  AttemptStatus,
  CampaignStatus,
  EmailStatus,
  OutboxStatus,
} from '../types/index.js';

export function createOutboxDispatchWorker(workerId: string) {
  return new Worker<OutboxDispatchJobV1>(
    QUEUE_NAMES.OUTBOX_DISPATCH,
    async (job: Job<OutboxDispatchJobV1>) => {
      const { outboxEventId } = job.data;

      // 1. Conditionally claim outbox event
      const updatedRows = await prisma.outboxEvent.updateMany({
        where: {
          id: outboxEventId,
          status: { in: [OutboxStatus.PENDING, OutboxStatus.FAILED] },
        },
        data: {
          status: OutboxStatus.PROCESSING,
          lockedAt: new Date(),
          lockedBy: workerId,
          attempts: { increment: 1 },
        },
      });

      if (updatedRows.count === 0) {
        // Already processed or claimed
        return;
      }

      try {
        const event = await prisma.outboxEvent.findUnique({
          where: { id: outboxEventId },
        });

        if (!event) return;

        const payload = JSON.parse(event.payload) as {
          campaignId: string;
          senderId: string;
        };

        const { campaignId, senderId } = payload;

        // 2. Load Campaign and Sender
        const [campaign, sender] = await Promise.all([
          prisma.campaign.findUnique({ where: { id: campaignId } }),
          prisma.sender.findUnique({ where: { id: senderId } }),
        ]);

        if (!campaign || !sender) {
          throw new Error(`Campaign or Sender missing for outbox event: ${outboxEventId}`);
        }

        // 3. Load emails in deterministic sequence order
        const emails = await prisma.email.findMany({
          where: { campaignId, status: EmailStatus.SCHEDULE_PENDING },
          orderBy: { sequenceNo: 'asc' },
        });

        if (emails.length === 0) {
          await prisma.outboxEvent.update({
            where: { id: outboxEventId },
            data: { status: OutboxStatus.DONE, processedAt: new Date() },
          });
          return;
        }

        // 4. Reserve slots through Redis Lua in chunks of 500 to keep Redis latency < 3ms
        const CHUNK_SIZE = 500;
        const reservationMap = new Map<string, any>();
        const allReservations: any[] = [];

        for (let i = 0; i < emails.length; i += CHUNK_SIZE) {
          const chunk = emails.slice(i, i + CHUNK_SIZE);
          const chunkItems = chunk.map((e) => ({
            reservationId: `${e.id}-a1`,
            campaignId,
            requestedAtMs: e.requestedAt.getTime(),
            campaignHourlyLimit: campaign.hourlyLimit,
            campaignMinimumDelayMs: campaign.minimumDelayMs,
          }));

          const chunkReservations = await RateLimiterService.reserveBatch(
            senderId,
            campaign.senderMinimumDelayMsSnapshot,
            campaign.senderHourlyLimitSnapshot,
            chunkItems,
          );

          for (const res of chunkReservations) {
            reservationMap.set(res.reservationId, res);
            allReservations.push(res);
          }
        }

        // 5. Update MySQL inside transaction (bulk optimized with 60s timeout)
        await prisma.$transaction(
          async (tx) => {
            const attemptRecords: Array<{
              emailId: string;
              attemptNumber: number;
              reservationId: string;
              reservedAt: Date;
              scheduledAt: Date;
              status: AttemptStatus;
            }> = [];

            const emailUpdatePromises: Promise<any>[] = [];

            for (const email of emails) {
              const res = reservationMap.get(`${email.id}-a1`);
              if (!res) continue;

              const scheduledAt = new Date(res.scheduledMs);
              const bullJobId = `email-send-${email.id}`;

              emailUpdatePromises.push(
                tx.email.update({
                  where: { id: email.id },
                  data: {
                    status: EmailStatus.SCHEDULED,
                    scheduledAt,
                    bullJobId,
                    attemptCount: 1,
                  },
                }),
              );

              attemptRecords.push({
                emailId: email.id,
                attemptNumber: 1,
                reservationId: res.reservationId,
                reservedAt: new Date(),
                scheduledAt,
                status: AttemptStatus.RESERVED,
              });
            }

            // Run email updates concurrently inside transaction
            await Promise.all(emailUpdatePromises);

            // Bulk insert all attempts in ONE single SQL round-trip
            if (attemptRecords.length > 0) {
              await tx.emailAttempt.createMany({
                data: attemptRecords,
              });
            }

            // Update campaign status
            await tx.campaign.update({
              where: { id: campaignId },
              data: {
                status: CampaignStatus.SCHEDULED,
                scheduledCount: emails.length,
              },
            });

            // Mark outbox event as DONE
            await tx.outboxEvent.update({
              where: { id: outboxEventId },
              data: {
                status: OutboxStatus.DONE,
                processedAt: new Date(),
              },
            });
          },
          {
            timeout: 60000, // 60s timeout to easily tolerate cloud database network latency
            maxWait: 15000,
          },
        );

        // 6. Bulk enqueue delayed jobs into BullMQ
        const bulkJobs = emails.map((email) => {
          const res = reservationMap.get(`${email.id}-a1`);
          const scheduledMs = res ? res.scheduledMs : email.requestedAt.getTime();
          const delay = Math.max(0, scheduledMs - Date.now());

          return {
            name: JOB_NAMES.EMAIL_SEND,
            data: {
              version: 1 as const,
              emailId: email.id,
              campaignId,
              senderId,
              recipientEmail: email.recipientEmail,
              scheduledAt: new Date(scheduledMs).toISOString(),
              attemptNo: 1,
            },
            opts: {
              jobId: `email-send-${email.id}`,
              delay,
            },
          };
        });

        await emailSendQueue.addBulk(bulkJobs);

        // 7. Check if any reservation triggered rate-limit notification
        for (const res of allReservations) {
          if (res.hitLimit && res.hourStart && res.hourEnd) {
            await slackNotificationQueue.add(
              JOB_NAMES.SLACK_RATE_LIMIT,
              {
                version: 1,
                senderId,
                senderDisplayName: sender.displayName,
                hourStart: new Date(res.hourStart).toISOString(),
                hourEnd: new Date(res.hourEnd).toISOString(),
                hourlyLimit: sender.hourlyLimit,
                reservedCount: sender.hourlyLimit,
                triggeredAt: new Date().toISOString(),
              },
              {
                jobId: `slack-rate-limit-${senderId}-${res.hourStart}`,
              },
            );
            break; // Exactly one notification trigger per hour
          }
        }
      } catch (err: any) {
        console.error(`Outbox dispatch failed for event ${outboxEventId}:`, err);
        await prisma.outboxEvent.update({
          where: { id: outboxEventId },
          data: {
            status: OutboxStatus.FAILED,
            lastError: err?.message || 'Unknown dispatch error',
            lastErrorAt: new Date(),
          },
        });
        throw err;
      }
    },
    {
      connection: { url: env.REDIS_URL },
      concurrency: 5,
    },
  );
}
