import { Queue } from 'bullmq';
import { env } from '../../config/env.js';
import {
  QUEUE_NAMES,
  EmailSendJobV1,
  SlackRateLimitHitJobV1,
  EmailIndexJobV1,
  OutboxDispatchJobV1,
} from '../contracts/job-contracts.js';

const connection = {
  url: env.REDIS_URL,
};

export const emailSendQueue = new Queue<EmailSendJobV1>(QUEUE_NAMES.EMAIL_SEND, {
  connection,
  defaultJobOptions: {
    removeOnComplete: { age: 86400, count: 5000 },
    removeOnFail: { age: 604800, count: 10000 },
  },
});

export const slackNotificationQueue = new Queue<SlackRateLimitHitJobV1>(
  QUEUE_NAMES.SLACK_NOTIFICATION,
  {
    connection,
    defaultJobOptions: {
      attempts: 5,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: { age: 86400, count: 1000 },
      removeOnFail: { age: 604800, count: 5000 },
    },
  },
);

export const emailIndexQueue = new Queue<EmailIndexJobV1>(QUEUE_NAMES.EMAIL_INDEX, {
  connection,
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: 'exponential', delay: 1000 },
    removeOnComplete: { age: 86400, count: 5000 },
    removeOnFail: { age: 604800, count: 10000 },
  },
});

export const outboxDispatchQueue = new Queue<OutboxDispatchJobV1>(QUEUE_NAMES.OUTBOX_DISPATCH, {
  connection,
  defaultJobOptions: {
    attempts: 10,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: { age: 86400, count: 5000 },
    removeOnFail: { age: 604800, count: 10000 },
  },
});

export const allQueues = [
  emailSendQueue,
  slackNotificationQueue,
  emailIndexQueue,
  outboxDispatchQueue,
];
