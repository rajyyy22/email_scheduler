import { prisma } from '../../infrastructure/database/prisma.js';
import { emailSendQueue } from '../../queue/queues/queue-factory.js';
import { JOB_NAMES } from '../../queue/contracts/job-contracts.js';
import { AppError } from '../../middleware/error.middleware.js';
import {
  type EmailDto,
  EmailStatus,
  ErrorCode,
  type PaginatedResult,
} from '../../types/index.js';

export class EmailService {
  /**
   * Retrieves paginated emails with cursor pagination for the authenticated user.
   */
  public static async listEmails(
    userId: string,
    view: 'scheduled' | 'sent',
    limit = 20,
    cursor?: string,
  ): Promise<PaginatedResult<EmailDto>> {
    const statuses: EmailStatus[] =
      view === 'scheduled'
        ? [EmailStatus.SCHEDULE_PENDING, EmailStatus.SCHEDULED, EmailStatus.SENDING]
        : [EmailStatus.SENT, EmailStatus.FAILED];

    const take = Math.min(Math.max(limit, 1), 100);

    const emails = await prisma.email.findMany({
      where: {
        userId,
        status: { in: statuses },
      },
      take: take + 1, // take one extra to determine if there's a next page
      ...(cursor
        ? {
            skip: 1,
            cursor: { id: cursor },
          }
        : {}),
      orderBy: view === 'scheduled' ? { scheduledAt: 'asc' } : { sentAt: 'desc' },
      include: {
        campaign: {
          select: { subject: true },
        },
      },
    });

    const hasMore = emails.length > take;
    const items = hasMore ? emails.slice(0, take) : emails;
    const nextCursor = hasMore ? items[items.length - 1]?.id || null : null;

    const mappedItems: EmailDto[] = items.map((e) => ({
      id: e.id,
      campaignId: e.campaignId,
      senderId: e.senderId,
      sequenceNo: e.sequenceNo,
      recipientEmail: e.recipientEmail,
      requestedAt: e.requestedAt.toISOString(),
      scheduledAt: e.scheduledAt ? e.scheduledAt.toISOString() : null,
      sentAt: e.sentAt ? e.sentAt.toISOString() : null,
      failedAt: e.failedAt ? e.failedAt.toISOString() : null,
      status: e.status as EmailStatus,
      attemptCount: e.attemptCount,
      providerMessageId: e.providerMessageId,
      previewUrl: e.previewUrl,
      lastErrorCode: e.lastErrorCode,
      lastErrorMessage: e.lastErrorMessage,
      createdAt: e.createdAt.toISOString(),
      subject: e.campaign?.subject,
    }));

    return {
      items: mappedItems,
      nextCursor,
      hasMore,
    };
  }

  public static async getEmailById(userId: string, emailId: string) {
    const email = await prisma.email.findFirst({
      where: {
        id: emailId,
        userId,
      },
      include: {
        campaign: {
          select: { subject: true, body: true },
        },
        sender: {
          select: { displayName: true, fromEmail: true },
        },
        attempts: {
          orderBy: { attemptNumber: 'asc' },
        },
      },
    });

    if (!email) return null;

    return {
      id: email.id,
      campaignId: email.campaignId,
      senderId: email.senderId,
      sequenceNo: email.sequenceNo,
      recipientEmail: email.recipientEmail,
      requestedAt: email.requestedAt.toISOString(),
      scheduledAt: email.scheduledAt ? email.scheduledAt.toISOString() : null,
      sentAt: email.sentAt ? email.sentAt.toISOString() : null,
      failedAt: email.failedAt ? email.failedAt.toISOString() : null,
      status: email.status as EmailStatus,
      attemptCount: email.attemptCount,
      providerMessageId: email.providerMessageId,
      previewUrl: email.previewUrl,
      lastErrorCode: email.lastErrorCode,
      lastErrorMessage: email.lastErrorMessage,
      createdAt: email.createdAt.toISOString(),
      subject: email.campaign?.subject,
      body: email.campaign?.body,
      sender: email.sender,
      attempts: email.attempts.map((a) => ({
        id: a.id,
        attemptNumber: a.attemptNumber,
        reservationId: a.reservationId,
        reservedAt: a.reservedAt.toISOString(),
        scheduledAt: a.scheduledAt.toISOString(),
        startedAt: a.startedAt?.toISOString() || null,
        finishedAt: a.finishedAt?.toISOString() || null,
        status: a.status,
        smtpMessageId: a.smtpMessageId,
        errorCode: a.errorCode,
        errorMessage: a.errorMessage,
      })),
    };
  }

  /**
   * Manually trigger retry for a failed email.
   */
  public static async retryEmail(userId: string, emailId: string): Promise<void> {
    const email = await prisma.email.findFirst({
      where: {
        id: emailId,
        userId,
      },
    });

    if (!email) {
      throw new AppError(404, ErrorCode.NOT_FOUND, 'Email not found');
    }

    if (email.status !== EmailStatus.FAILED) {
      throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'Only failed emails can be retried');
    }

    // Reset status to SCHEDULED
    await prisma.email.update({
      where: { id: emailId },
      data: {
        status: EmailStatus.SCHEDULED,
        failedAt: null,
        scheduledAt: new Date(),
      },
    });

    // Enqueue delayed job to run immediately
    await emailSendQueue.add(
      JOB_NAMES.EMAIL_SEND,
      {
        version: 1,
        emailId: email.id,
        campaignId: email.campaignId,
        senderId: email.senderId,
        recipientEmail: email.recipientEmail,
        scheduledAt: new Date().toISOString(),
        attemptNo: email.attemptCount + 1,
      },
      {
        jobId: `email-send-${email.id}`,
      },
    );
  }
}
