import { Client } from '@elastic/elasticsearch';
import { env } from '../../config/env.js';
export const ES_INDEX_NAME = 'reachinbox-emails-v1';
export const esClient = new Client({
    node: env.ELASTICSEARCH_URL,
});
export async function initElasticsearchIndex() {
    try {
        const exists = await esClient.indices.exists({ index: ES_INDEX_NAME });
        if (!exists) {
            await esClient.indices.create({
                index: ES_INDEX_NAME,
                mappings: {
                    properties: {
                        id: { type: 'keyword' },
                        userId: { type: 'keyword' },
                        campaignId: { type: 'keyword' },
                        senderId: { type: 'keyword' },
                        recipientEmail: {
                            type: 'keyword',
                            fields: {
                                text: { type: 'text' },
                            },
                        },
                        subject: { type: 'text', analyzer: 'standard' },
                        body: { type: 'text', analyzer: 'standard' },
                        status: { type: 'keyword' },
                        requestedAt: { type: 'date' },
                        scheduledAt: { type: 'date' },
                        sentAt: { type: 'date' },
                        createdAt: { type: 'date' },
                    },
                },
            });
            console.log(`Elasticsearch index ${ES_INDEX_NAME} initialized.`);
        }
    }
    catch (err) {
        console.warn('Elasticsearch initialization warning (non-blocking):', err);
    }
}
//# sourceMappingURL=es-client.js.map