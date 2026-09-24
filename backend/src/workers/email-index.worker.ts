import { Worker, Job } from 'bullmq';
import { prisma } from '../infrastructure/database/prisma.js';
import {
  esClient,
  ES_INDEX_NAME,
} from '../infrastructure/elasticsearch/es-client.js';
import {
  QUEUE_NAMES,
  type EmailIndexJobV1,
} from '../queue/contracts/job-contracts.js';
import { env } from '../config/env.js';

export function createEmailIndexWorker(_workerId: string) {
  return new Worker<EmailIndexJobV1>(
    QUEUE_NAMES.EMAIL_INDEX,
    async (job: Job<EmailIndexJobV1>) => {
      const { emailId, operation } = job.data;

      if (operation === 'delete') {
        try {
          await esClient.delete({
            index: ES_INDEX_NAME,
            id: emailId,
          });
        } catch (err: any) {
          if (err.meta?.statusCode !== 404) throw err;
        }
        return;
      }

      // 1. Reload authoritative email state from MySQL
      const email = await prisma.email.findUnique({
        where: { id: emailId },
        include: {
          campaign: {
            select: { subject: true, body: true },
          },
        },
      });

      if (!email) return;

      // 2. Upsert document in Elasticsearch
      await esClient.update({
        index: ES_INDEX_NAME,
        id: email.id,
        doc: {
          id: email.id,
          userId: email.userId,
          campaignId: email.campaignId,
          senderId: email.senderId,
          recipientEmail: email.recipientEmail,
          subject: email.campaign?.subject || '',
          body: email.campaign?.body || '',
          status: email.status,
          requestedAt: email.requestedAt.toISOString(),
          scheduledAt: email.scheduledAt ? email.scheduledAt.toISOString() : null,
          sentAt: email.sentAt ? email.sentAt.toISOString() : null,
          createdAt: email.createdAt.toISOString(),
        },
        doc_as_upsert: true,
      });

      // Update searchIndexedAt in MySQL
      await prisma.email.update({
        where: { id: emailId },
        data: { searchIndexedAt: new Date() },
      });
    },
    {
      connection: { url: env.REDIS_URL },
      concurrency: 10,
    },
  );
}
