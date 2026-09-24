import { Worker, Job } from 'bullmq';
import { SlackService } from '../modules/slack/slack.service.js';
import {
  QUEUE_NAMES,
  type SlackRateLimitHitJobV1,
} from '../queue/contracts/job-contracts.js';
import { env } from '../config/env.js';

export function createSlackNotificationWorker(_workerId: string) {
  return new Worker<SlackRateLimitHitJobV1>(
    QUEUE_NAMES.SLACK_NOTIFICATION,
    async (job: Job<SlackRateLimitHitJobV1>) => {
      const { senderId, hourStart, hourEnd, hourlyLimit, reservedCount } = job.data;

      const sent = await SlackService.sendRateLimitAlert(
        senderId,
        hourStart,
        hourEnd,
        hourlyLimit,
        reservedCount,
      );

      if (sent) {
        console.log(`[Slack] Rate limit alert dispatched for sender ${senderId} (window ${hourStart} - ${hourEnd})`);
      } else {
        console.log(`[Slack] No active Slack connection for sender ${senderId}. Alert skipped.`);
      }
    },
    {
      connection: { url: env.REDIS_URL },
      concurrency: 5,
    },
  );
}
