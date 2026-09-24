import { prisma } from '../infrastructure/database/prisma.js';
import { RateLimiterService } from '../infrastructure/redis/rate-limiter.service.js';
import { emailSendQueue } from '../queue/queues/queue-factory.js';
import { JOB_NAMES } from '../queue/contracts/job-contracts.js';
import { env } from '../config/env.js';
import { AttemptStatus, EmailStatus } from '../types/index.js';

export class RetrySchedulerService {
  /**
   * Schedules a rate-controlled retry attempt for an email after a transient failure.
   */
  public static async scheduleRetry(
    emailId: string,
    campaignId: string,
    senderId: string,
    currentAttemptNo: number,
  ): Promise<boolean> {
    const nextAttemptNo = currentAttemptNo + 1;

    if (nextAttemptNo > env.EMAIL_RETRY_ATTEMPTS) {
      // Exceeded retry ceiling
      return false;
    }

    // 1. Fetch Campaign and Sender configuration
    const [campaign, sender] = await Promise.all([
      prisma.campaign.findUnique({ where: { id: campaignId } }),
      prisma.sender.findUnique({ where: { id: senderId } }),
    ]);

    if (!campaign || !sender) {
      return false;
    }

    // 2. Exponential backoff with jitter
    const backoffBase = env.EMAIL_RETRY_BASE_DELAY_MS;
    const exponentialMultiplier = Math.pow(2, currentAttemptNo - 1);
    const jitter = Math.floor(Math.random() * 1000);
    const candidateMs = Date.now() + backoffBase * exponentialMultiplier + jitter;

    const reservationId = `${emailId}-a${nextAttemptNo}`;

    // 3. Atomically reserve slot via Redis Lua
    const reservations = await RateLimiterService.reserveBatch(
      senderId,
      sender.minimumDelayMs,
      sender.hourlyLimit,
      [
        {
          reservationId,
          campaignId,
          requestedAtMs: candidateMs,
          campaignHourlyLimit: campaign.hourlyLimit,
          campaignMinimumDelayMs: campaign.minimumDelayMs,
        },
      ],
    );

    const reservation = reservations[0];
    if (!reservation) return false;

    const scheduledDate = new Date(reservation.scheduledMs);

    // 4. Update MySQL: insert new attempt and reset email to SCHEDULED
    await prisma.$transaction(async (tx) => {
      await tx.emailAttempt.create({
        data: {
          emailId,
          attemptNumber: nextAttemptNo,
          reservationId,
          reservedAt: new Date(),
          scheduledAt: scheduledDate,
          status: AttemptStatus.RESERVED,
        },
      });

      await tx.email.update({
        where: { id: emailId },
        data: {
          status: EmailStatus.SCHEDULED,
          attemptCount: nextAttemptNo,
          scheduledAt: scheduledDate,
        },
      });
    });

    // 5. Enqueue delayed BullMQ job
    const delay = Math.max(0, reservation.scheduledMs - Date.now());
    await emailSendQueue.add(
      JOB_NAMES.EMAIL_SEND,
      {
        version: 1,
        emailId,
        campaignId,
        senderId,
        recipientEmail: (await prisma.email.findUnique({ where: { id: emailId } }))?.recipientEmail || '',
        scheduledAt: scheduledDate.toISOString(),
        attemptNo: nextAttemptNo,
      },
      {
        jobId: `email-send-${emailId}`,
        delay,
      },
    );

    return true;
  }
}
