import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../../infrastructure/database/prisma.js';
import { outboxDispatchQueue } from '../../queue/queues/queue-factory.js';
import { JOB_NAMES } from '../../queue/contracts/job-contracts.js';
import { AppError } from '../../middleware/error.middleware.js';
import { env } from '../../config/env.js';
import {
  type CampaignDto,
  type CampaignSchedulePreview,
  CampaignStatus,
  type CreateCampaignRequest,
  EmailStatus,
  ErrorCode,
  OutboxStatus,
} from '../../types/index.js';

export class CampaignService {
  /**
   * Ingests a new campaign and its email leads transactionally.
   * Creates Campaign (SCHEDULE_PENDING), Email rows, and an OutboxEvent.
   * Returns immediately with 202 Accepted status and schedule preview metrics.
   */
  public static async createCampaign(
    userId: string,
    data: CreateCampaignRequest,
    validEmails: string[],
    parseStats: { totalDetected: number; invalidCount: number; duplicatesRemoved: number },
  ): Promise<{ campaign: CampaignDto; preview: CampaignSchedulePreview }> {
    if (validEmails.length === 0) {
      throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'At least one valid email recipient is required');
    }

    if (validEmails.length > env.MAX_EMAILS_PER_CAMPAIGN) {
      throw new AppError(
        400,
        ErrorCode.VALIDATION_ERROR,
        `Campaign exceeds maximum allowed recipients (${env.MAX_EMAILS_PER_CAMPAIGN})`,
      );
    }

    // 1. Verify Sender ownership and get sender configuration
    const sender = await prisma.sender.findFirst({
      where: { id: data.senderId, userId, isActive: true },
    });

    if (!sender) {
      throw new AppError(404, ErrorCode.NOT_FOUND, 'Sender not found or not active');
    }

    // Effective settings: snapshot sender's current limits
    const senderHourlyLimitSnapshot = sender.hourlyLimit;
    const senderMinimumDelayMsSnapshot = sender.minimumDelayMs;

    const campaignMinimumDelayMs = data.minimumDelayMs ?? senderMinimumDelayMsSnapshot;
    const campaignHourlyLimit = data.hourlyLimit ?? senderHourlyLimitSnapshot;
    const requestedStartAt = new Date(data.startAt);

    if (isNaN(requestedStartAt.getTime())) {
      throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'Invalid startAt date format');
    }

    const campaignId = uuidv4();
    const outboxEventId = uuidv4();

    // 2. Prepare Email records (all in SCHEDULE_PENDING state)
    const emailRecords = validEmails.map((recipientEmail, index) => ({
      id: uuidv4(),
      userId,
      campaignId,
      senderId: sender.id,
      sequenceNo: index + 1,
      recipientEmail,
      requestedAt: requestedStartAt,
      status: EmailStatus.SCHEDULE_PENDING,
    }));

    // 3. Atomically persist Campaign, Emails, and OutboxEvent
    await prisma.$transaction(async (tx) => {
      // Create Campaign
      await tx.campaign.create({
        data: {
          id: campaignId,
          userId,
          senderId: sender.id,
          subject: data.subject,
          body: data.body,
          requestedStartAt,
          minimumDelayMs: campaignMinimumDelayMs,
          hourlyLimit: campaignHourlyLimit,
          senderHourlyLimitSnapshot,
          senderMinimumDelayMsSnapshot,
          totalRecipients: validEmails.length,
          scheduledCount: 0,
          sentCount: 0,
          failedCount: 0,
          status: CampaignStatus.SCHEDULE_PENDING,
        },
      });

      // Bulk insert Emails
      await tx.email.createMany({
        data: emailRecords,
      });

      // Create Outbox Event
      await tx.outboxEvent.create({
        data: {
          id: outboxEventId,
          eventType: 'CAMPAIGN_SCHEDULE',
          aggregateType: 'Campaign',
          aggregateId: campaignId,
          payload: JSON.stringify({
            campaignId,
            senderId: sender.id,
            totalRecipients: validEmails.length,
          }),
          status: OutboxStatus.PENDING,
        },
      });
    });

    // 4. Dispatch job to Outbox Queue for immediate asynchronous execution
    await outboxDispatchQueue.add(
      JOB_NAMES.OUTBOX_DISPATCH,
      {
        version: 1,
        outboxEventId,
      },
      {
        jobId: `outbox-dispatch-${outboxEventId}`,
      },
    );

    // 5. Calculate estimated preview timeline
    const effectiveDelay = Math.max(senderMinimumDelayMsSnapshot, campaignMinimumDelayMs);
    const effectiveHourlyLimit = Math.min(senderHourlyLimitSnapshot, campaignHourlyLimit);

    const firstSendAt = requestedStartAt.toISOString();
    const currentHourCapacity = effectiveHourlyLimit;
    const currentHourCount = Math.min(validEmails.length, currentHourCapacity);
    const nextHourOverflowCount = Math.max(0, validEmails.length - currentHourCapacity);

    // Calculate approximate completion time
    const totalHoursRequired = Math.ceil(validEmails.length / effectiveHourlyLimit);
    const remainingInLastHour = validEmails.length % effectiveHourlyLimit || effectiveHourlyLimit;
    const estimatedCompletionMs =
      requestedStartAt.getTime() +
      (totalHoursRequired - 1) * 3600000 +
      (remainingInLastHour - 1) * effectiveDelay;

    const preview: CampaignSchedulePreview = {
      totalRecipients: validEmails.length,
      validRecipients: validEmails.length,
      invalidRecipients: parseStats.invalidCount,
      duplicatesRemoved: parseStats.duplicatesRemoved,
      firstSendAt,
      estimatedCompletionAt: new Date(estimatedCompletionMs).toISOString(),
      currentHourCount,
      nextHourOverflowCount,
    };

    const createdCampaign: CampaignDto = {
      id: campaignId,
      userId,
      senderId: sender.id,
      subject: data.subject,
      body: data.body,
      requestedStartAt: requestedStartAt.toISOString(),
      minimumDelayMs: campaignMinimumDelayMs,
      hourlyLimit: campaignHourlyLimit,
      totalRecipients: validEmails.length,
      scheduledCount: 0,
      sentCount: 0,
      failedCount: 0,
      status: CampaignStatus.SCHEDULE_PENDING,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      sender: {
        displayName: sender.displayName,
        fromEmail: sender.fromEmail,
      },
    };

    return { campaign: createdCampaign, preview };
  }

  public static async listCampaigns(userId: string): Promise<CampaignDto[]> {
    const campaigns = await prisma.campaign.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: {
        sender: {
          select: { displayName: true, fromEmail: true },
        },
      },
    });

    return campaigns.map((c) => ({
      id: c.id,
      userId: c.userId,
      senderId: c.senderId,
      subject: c.subject,
      body: c.body,
      requestedStartAt: c.requestedStartAt.toISOString(),
      minimumDelayMs: c.minimumDelayMs,
      hourlyLimit: c.hourlyLimit,
      totalRecipients: c.totalRecipients,
      scheduledCount: c.scheduledCount,
      sentCount: c.sentCount,
      failedCount: c.failedCount,
      status: c.status as CampaignStatus,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
      sender: c.sender,
    }));
  }

  public static async getCampaignById(userId: string, campaignId: string): Promise<CampaignDto | null> {
    const campaign = await prisma.campaign.findFirst({
      where: { id: campaignId, userId },
      include: {
        sender: {
          select: { displayName: true, fromEmail: true },
        },
      },
    });

    if (!campaign) return null;

    return {
      id: campaign.id,
      userId: campaign.userId,
      senderId: campaign.senderId,
      subject: campaign.subject,
      body: campaign.body,
      requestedStartAt: campaign.requestedStartAt.toISOString(),
      minimumDelayMs: campaign.minimumDelayMs,
      hourlyLimit: campaign.hourlyLimit,
      totalRecipients: campaign.totalRecipients,
      scheduledCount: campaign.scheduledCount,
      sentCount: campaign.sentCount,
      failedCount: campaign.failedCount,
      status: campaign.status as CampaignStatus,
      createdAt: campaign.createdAt.toISOString(),
      updatedAt: campaign.updatedAt.toISOString(),
      sender: campaign.sender,
    };
  }
}
