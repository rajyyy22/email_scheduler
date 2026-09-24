import { v4 as uuidv4 } from 'uuid';
import { prisma } from './infrastructure/database/prisma.js';
import { redis } from './infrastructure/redis/redis.js';
import { outboxDispatchQueue } from './queue/queues/queue-factory.js';
import { JOB_NAMES } from './queue/contracts/job-contracts.js';
import { createOutboxDispatchWorker } from './workers/outbox-dispatch.worker.js';
import { createEmailSendWorker } from './workers/email-send.worker.js';
import { createSlackNotificationWorker } from './workers/slack-notification.worker.js';
import { createEmailIndexWorker } from './workers/email-index.worker.js';
import { OutboxStatus } from './types/index.js';

export async function startWorker(options: { standalone?: boolean } = {}) {
  const workerId = `worker_${uuidv4().substring(0, 8)}`;
  console.log(`🚀 Starting ReachInbox Worker Process: ${workerId}`);

  // 1. Initialize BullMQ workers
  const outboxWorker = createOutboxDispatchWorker(workerId);
  const emailWorker = createEmailSendWorker(workerId);
  const slackWorker = createSlackNotificationWorker(workerId);
  const indexWorker = createEmailIndexWorker(workerId);

  console.log('✅ Registered BullMQ Workers:');
  console.log('   - outbox-dispatch-v1');
  console.log('   - email-send-v1');
  console.log('   - slack-notification-v1');
  console.log('   - email-index-v1');

  // 2. Outbox Recovery Loop: Polls every 30s for any stuck PENDING outbox events (crash safety fallback)
  const recoveryInterval = setInterval(async () => {
    try {
      const stuckEvents = await prisma.outboxEvent.findMany({
        where: {
          status: OutboxStatus.PENDING,
          availableAt: { lte: new Date() },
        },
        take: 10,
      });

      for (const event of stuckEvents) {
        await outboxDispatchQueue.add(
          JOB_NAMES.OUTBOX_DISPATCH,
          { version: 1, outboxEventId: event.id },
          { jobId: `outbox-dispatch-${event.id}` },
        );
      }
    } catch (err: any) {
      console.warn('Outbox recovery sweep error:', err.message);
    }
  }, 30000);

  // 3. Stale Lock Reaper: Scans every 60s for emails orphaned in SENDING state > 5m
  const reaperInterval = setInterval(async () => {
    try {
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      const orphanedEmails = await prisma.email.findMany({
        where: {
          status: 'SENDING',
          lockedAt: { lte: fiveMinutesAgo },
        },
        take: 50,
      });

      for (const email of orphanedEmails) {
        console.warn(`[Reaper] Found orphaned email ${email.id} in SENDING state. Reclaiming...`);
        // If it was already sent in attempts, mark SENT; otherwise reset to SCHEDULED for retry
        const lastAttempt = await prisma.emailAttempt.findFirst({
          where: { emailId: email.id },
          orderBy: { attemptNumber: 'desc' },
        });

        if (lastAttempt && lastAttempt.smtpMessageId) {
          await prisma.email.update({
            where: { id: email.id },
            data: { status: 'SENT', sentAt: lastAttempt.finishedAt || new Date() },
          });
        } else {
          await prisma.email.update({
            where: { id: email.id },
            data: { status: 'SCHEDULED', lockedAt: null, lockedBy: null },
          });
        }
      }
    } catch (err: any) {
      console.warn('Stale lock reaper sweep error:', err.message);
    }
  }, 60000);

  const stop = async () => {
    clearInterval(recoveryInterval);
    clearInterval(reaperInterval);
    await Promise.all([
      outboxWorker.close(),
      emailWorker.close(),
      slackWorker.close(),
      indexWorker.close(),
    ]);
    console.log('BullMQ workers halted.');
  };

  if (options.standalone) {
    const shutdown = async (signal: string) => {
      console.log(`\n${signal} received. Closing workers gracefully...`);
      try {
        await stop();
        await redis.quit();
        console.log('Redis connection closed.');
        await prisma.$disconnect();
        console.log('MySQL connection pool closed.');
        process.exit(0);
      } catch (err) {
        console.error('Error during worker shutdown:', err);
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  }

  return { stop };
}

// Auto-run if executed directly as entrypoint
const isMain =
  Boolean(process.argv[1]) &&
  (process.argv[1].endsWith('worker.js') || process.argv[1].endsWith('worker.ts'));

if (isMain) {
  startWorker({ standalone: true }).catch((err) => {
    console.error('Fatal worker process error:', err);
    process.exit(1);
  });
}
