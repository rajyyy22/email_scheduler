export const QUEUE_NAMES = {
  EMAIL_SEND: 'email-send-v1',
  SLACK_NOTIFICATION: 'slack-notification-v1',
  EMAIL_INDEX: 'email-index-v1',
  OUTBOX_DISPATCH: 'outbox-dispatch-v1',
} as const;

export const JOB_NAMES = {
  EMAIL_SEND: 'email.send',
  SLACK_RATE_LIMIT: 'slack.rate-limit-hit',
  EMAIL_INDEX: 'email.index',
  OUTBOX_DISPATCH: 'outbox.dispatch',
} as const;

export interface EmailSendJobV1 {
  version: 1;
  emailId: string;
  campaignId: string;
  senderId: string;
  recipientEmail: string;
  scheduledAt: string; // ISO-8601 UTC
  attemptNo: number;
}

export interface SlackRateLimitHitJobV1 {
  version: 1;
  senderId: string;
  senderDisplayName: string;
  hourStart: string; // ISO-8601 UTC
  hourEnd: string;   // ISO-8601 UTC
  hourlyLimit: number;
  reservedCount: number;
  triggeredAt: string; // ISO-8601 UTC
}

export interface EmailIndexJobV1 {
  version: 1;
  emailId: string;
  operation: 'upsert' | 'delete';
}

export interface OutboxDispatchJobV1 {
  version: 1;
  outboxEventId: string;
}
