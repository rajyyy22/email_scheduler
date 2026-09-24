import { esClient, ES_INDEX_NAME } from '../../infrastructure/elasticsearch/es-client.js';
import { prisma } from '../../infrastructure/database/prisma.js';

export interface SearchEmailsQuery {
  userId: string;
  q?: string;
  status?: string;
  senderId?: string;
  campaignId?: string;
  limit?: number;
}

export class SearchService {
  public static async searchEmails(params: SearchEmailsQuery) {
    const mustFilters: any[] = [{ term: { userId: params.userId } }];

    if (params.status) {
      mustFilters.push({ term: { status: params.status } });
    }
    if (params.senderId) {
      mustFilters.push({ term: { senderId: params.senderId } });
    }
    if (params.campaignId) {
      mustFilters.push({ term: { campaignId: params.campaignId } });
    }

    const mustClauses: any[] = [];
    if (params.q && params.q.trim().length > 0) {
      mustClauses.push({
        multi_match: {
          query: params.q,
          fields: ['recipientEmail^3', 'recipientEmail.text^2', 'subject^2', 'body'],
          fuzziness: 'AUTO',
        },
      });
    }

    try {
      const response = await esClient.search({
        index: ES_INDEX_NAME,
        size: Math.min(params.limit || 20, 100),
        query: {
          bool: {
            filter: mustFilters,
            ...(mustClauses.length > 0 ? { must: mustClauses } : {}),
          },
        },
        sort: [{ scheduledAt: { order: 'desc', missing: '_last' } }],
      });

      const hits = response.hits.hits.map((hit) => hit._source);
      return {
        total: typeof response.hits.total === 'number' ? response.hits.total : response.hits.total?.value || 0,
        items: hits,
      };
    } catch (err: unknown) {
      console.warn('Elasticsearch offline or indexing pending; falling back to relational database search');
      
      const query = params.q?.trim() || '';
      const limit = Math.min(params.limit || 20, 100);

      const [total, emails] = await Promise.all([
        prisma.email.count({
          where: {
            userId: params.userId,
            ...(params.status ? { status: params.status as any } : {}),
            ...(params.senderId ? { senderId: params.senderId } : {}),
            ...(params.campaignId ? { campaignId: params.campaignId } : {}),
            ...(query
              ? {
                  OR: [
                    { recipientEmail: { contains: query } },
                    { campaign: { subject: { contains: query } } },
                    { campaign: { body: { contains: query } } },
                  ],
                }
              : {}),
          },
        }),
        prisma.email.findMany({
          where: {
            userId: params.userId,
            ...(params.status ? { status: params.status as any } : {}),
            ...(params.senderId ? { senderId: params.senderId } : {}),
            ...(params.campaignId ? { campaignId: params.campaignId } : {}),
            ...(query
              ? {
                  OR: [
                    { recipientEmail: { contains: query } },
                    { campaign: { subject: { contains: query } } },
                    { campaign: { body: { contains: query } } },
                  ],
                }
              : {}),
          },
          take: limit,
          orderBy: { scheduledAt: 'desc' },
          include: {
            campaign: {
              select: { subject: true, body: true },
            },
          },
        }),
      ]);

      const items = emails.map((e) => ({
        id: e.id,
        userId: e.userId,
        campaignId: e.campaignId,
        senderId: e.senderId,
        recipientEmail: e.recipientEmail,
        subject: e.campaign?.subject || '',
        body: e.campaign?.body || '',
        status: e.status,
        requestedAt: e.requestedAt.toISOString(),
        scheduledAt: e.scheduledAt?.toISOString() || null,
        sentAt: e.sentAt?.toISOString() || null,
        createdAt: e.createdAt.toISOString(),
      }));

      return { total, items };
    }
  }
}
