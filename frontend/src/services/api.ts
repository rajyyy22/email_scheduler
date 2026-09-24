const BASE_URL = '/api/v1';

export interface User {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  createdAt: string;
}

export interface Sender {
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

export interface CreateSenderPayload {
  displayName: string;
  fromEmail: string;
  fromName: string;
  smtpHost: string;
  smtpPort: number;
  smtpSecure?: boolean;
  smtpUsername: string;
  smtpPassword?: string;
  hourlyLimit?: number;
  minimumDelayMs?: number;
  isActive?: boolean;
}

export interface Campaign {
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
  status:
    | 'SCHEDULE_PENDING'
    | 'SCHEDULED'
    | 'RUNNING'
    | 'COMPLETED'
    | 'COMPLETED_WITH_FAILURES'
    | 'CANCELLED'
    | 'FAILED';
  createdAt: string;
  updatedAt: string;
  sender?: {
    displayName: string;
    fromEmail: string;
  };
}

export interface EmailAttempt {
  id: string;
  attemptNumber: number;
  reservationId: string;
  reservedAt: string;
  scheduledAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  status: 'RESERVED' | 'SENDING' | 'SENT' | 'FAILED' | 'UNKNOWN';
  smtpMessageId: string | null;
  errorCode: string | null;
  errorMessage: string | null;
}

export interface Email {
  id: string;
  campaignId: string;
  senderId: string;
  sequenceNo: number;
  recipientEmail: string;
  requestedAt: string;
  scheduledAt: string | null;
  sentAt: string | null;
  failedAt: string | null;
  status: 'SCHEDULE_PENDING' | 'SCHEDULED' | 'SENDING' | 'SENT' | 'FAILED';
  attemptCount: number;
  providerMessageId: string | null;
  previewUrl: string | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  createdAt: string;
  subject?: string;
  body?: string;
  sender?: {
    displayName: string;
    fromEmail: string;
  };
  attempts?: EmailAttempt[];
}

export interface PaginatedResult<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
  total?: number;
}

export interface SlackConnection {
  connected: boolean;
  teamId?: string;
  teamName?: string;
  channelId?: string;
  channelName?: string;
  connectedAt?: string;
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

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const isFormData = options.body instanceof FormData;
  const headers: Record<string, string> = {
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    ...(options.headers as Record<string, string> || {}),
  };

  const response = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    headers,
    credentials: 'include', // Automatically passes HTTP-only session cookie
  });

  if (!response.ok) {
    let errorData: { error?: { message?: string; code?: string } } | null = null;
    try {
      errorData = (await response.json()) as { error?: { message?: string; code?: string } };
    } catch {
      errorData = { error: { message: response.statusText, code: 'HTTP_ERROR' } };
    }
    const message = errorData?.error?.message || response.statusText || 'An unexpected error occurred';
    throw new Error(message);
  }

  return response.json();
}

export const api = {
  auth: {
    getMe: () => request<{ user: User }>('/auth/me'),
    logout: () => request<{ success: boolean }>('/auth/logout', { method: 'POST' }),
    devLogin: (email?: string, name?: string) =>
      request<{ success: boolean; user: User }>('/auth/dev-login', {
        method: 'POST',
        body: JSON.stringify({ email, name }),
      }),
  },

  senders: {
    list: (activeOnly = false) => request<Sender[]>(`/senders${activeOnly ? '?active=true' : ''}`),
    create: (data: CreateSenderPayload) =>
      request<Sender>('/senders', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    update: (id: string, data: Partial<CreateSenderPayload>) =>
      request<Sender>(`/senders/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    toggleActive: (id: string) =>
      request<Sender>(`/senders/${id}/toggle`, {
        method: 'PATCH',
      }),
  },

  campaigns: {
    list: () => request<Campaign[]>('/campaigns'),
    getById: (id: string) => request<Campaign>(`/campaigns/${id}`),
    createMultipart: (formData: FormData, idempotencyKey?: string) => {
      const headers: Record<string, string> = {};
      if (idempotencyKey) {
        headers['Idempotency-Key'] = idempotencyKey;
      }
      return request<{
        message: string;
        campaign: Campaign;
        preview: CampaignSchedulePreview;
      }>('/campaigns', {
        method: 'POST',
        headers,
        body: formData,
      });
    },
  },

  emails: {
    list: (view: 'scheduled' | 'sent', limit = 20, cursor?: string) => {
      const params = new URLSearchParams({ view, limit: limit.toString() });
      if (cursor) params.append('cursor', cursor);
      return request<PaginatedResult<Email>>(`/emails?${params.toString()}`);
    },
    getById: (id: string) => request<Email>(`/emails/${id}`),
    retry: (id: string) =>
      request<{ success: boolean; message: string }>(`/emails/${id}/retry`, {
        method: 'POST',
      }),
  },

  search: {
    emails: (q: string, status?: string) => {
      const params = new URLSearchParams({ q });
      if (status) params.append('status', status);
      return request<{ total: number; items: Email[] }>(`/search/emails?${params.toString()}`);
    },
  },

  slack: {
    getStatus: () => request<SlackConnection>('/integrations/slack'),
    disconnect: () => request<{ success: boolean; message: string }>('/integrations/slack', { method: 'DELETE' }),
  },
};
