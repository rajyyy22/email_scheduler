import { CampaignStatus, EmailStatus, ErrorCode } from './enums.js';

export interface StandardErrorResponse {
  error: {
    code: ErrorCode | string;
    message: string;
    details?: Array<{
      field?: string;
      reason: string;
    }>;
  };
  requestId: string;
}

export interface UserDto {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  createdAt: string;
}

export interface SenderDto {
  id: string;
  displayName: string;
  fromEmail: string;
  fromName: string;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  hourlyLimit: number;
  minimumDelayMs: number;
  isActive: boolean;
  createdAt: string;
}

export interface CreateSenderRequest {
  displayName: string;
  fromEmail: string;
  fromName: string;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUsername: string;
  smtpPassword: string;
  hourlyLimit?: number;
  minimumDelayMs?: number;
}

export interface CreateCampaignRequest {
  senderId: string;
  subject: string;
  body: string;
  startAt: string; // ISO-8601 UTC
  minimumDelayMs?: number;
  hourlyLimit?: number;
  recipients?: string[];
}

export interface CampaignSchedulePreview {
  totalRecipients: number;
  validRecipients: number;
  invalidRecipients: number;
  duplicatesRemoved: number;
  firstSendAt: string;
  estimatedCompletionAt: string;
  currentHourCount: number;
  nextHourOverflowCount: number;
}

export interface CampaignDto {
  id: string;
  userId: string;
  senderId: string;
  subject: string;
  body: string;
  requestedStartAt: string;
  minimumDelayMs: number;
  hourlyLimit: number;
  totalRecipients: number;
  scheduledCount: number;
  sentCount: number;
  failedCount: number;
  status: CampaignStatus;
  createdAt: string;
  updatedAt: string;
  sender?: {
    displayName: string;
    fromEmail: string;
  };
}

export interface EmailDto {
  id: string;
  campaignId: string;
  senderId: string;
  sequenceNo: number;
  recipientEmail: string;
  requestedAt: string;
  scheduledAt: string | null;
  sentAt: string | null;
  failedAt: string | null;
  status: EmailStatus;
  attemptCount: number;
  providerMessageId: string | null;
  previewUrl: string | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  createdAt: string;
  subject?: string;
}

export interface PaginatedResult<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
  total?: number;
}

export interface SlackConnectionDto {
  connected: boolean;
  teamId?: string;
  teamName?: string;
  channelId?: string;
  channelName?: string;
  connectedAt?: string;
}
