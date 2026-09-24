import crypto from 'crypto';
import { WebClient } from '@slack/web-api';
import { env } from '../../config/env.js';
import { prisma } from '../../infrastructure/database/prisma.js';
import { redis } from '../../infrastructure/redis/redis.js';
import { encryptCredential, decryptCredential } from '../../infrastructure/security/crypto.js';
import { AppError } from '../../middleware/error.middleware.js';
import { ErrorCode } from '@reachinbox/shared-types';
export class SlackService {
    static slackClient = new WebClient();
    static async generateSlackConnectUrl(userId) {
        const state = crypto.randomBytes(32).toString('hex');
        await redis.set(`oauth:v1:slack:${state}`, JSON.stringify({ userId }), 'EX', 600);
        const redirectUri = encodeURIComponent(env.SLACK_CALLBACK_URL);
        const clientId = encodeURIComponent(env.SLACK_CLIENT_ID);
        const scope = encodeURIComponent('incoming-webhook');
        return `https://slack.com/oauth/v2/authorize?client_id=${clientId}&scope=${scope}&redirect_uri=${redirectUri}&state=${state}`;
    }
    static async handleSlackCallback(code, state) {
        const rawState = await redis.get(`oauth:v1:slack:${state}`);
        if (!rawState) {
            throw new AppError(403, ErrorCode.FORBIDDEN, 'Invalid or expired Slack OAuth state');
        }
        await redis.del(`oauth:v1:slack:${state}`);
        const { userId } = JSON.parse(rawState);
        // Exchange code for tokens
        const response = await this.slackClient.oauth.v2.access({
            client_id: env.SLACK_CLIENT_ID,
            client_secret: env.SLACK_CLIENT_SECRET,
            code,
            redirect_uri: env.SLACK_CALLBACK_URL,
        });
        if (!response.ok || !response.incoming_webhook) {
            throw new AppError(400, ErrorCode.INTERNAL_ERROR, `Slack OAuth failed: ${response.error || 'No incoming webhook received'}`);
        }
        const team = response.team;
        const webhook = response.incoming_webhook;
        const webhookEncrypted = encryptCredential(webhook.url);
        // Upsert Slack Connection in MySQL
        await prisma.slackConnection.upsert({
            where: {
                uq_user_team: {
                    userId,
                    teamId: team.id,
                },
            },
            update: {
                teamName: team.name,
                channelId: webhook.channel_id,
                channelName: webhook.channel,
                webhookUrlEncrypted: webhookEncrypted,
                scope: response.scope || 'incoming-webhook',
                disconnectedAt: null,
            },
            create: {
                userId,
                teamId: team.id,
                teamName: team.name,
                channelId: webhook.channel_id,
                channelName: webhook.channel,
                webhookUrlEncrypted: webhookEncrypted,
                scope: response.scope || 'incoming-webhook',
            },
        });
    }
    static async getSlackStatus(userId) {
        const connection = await prisma.slackConnection.findFirst({
            where: {
                userId,
                disconnectedAt: null,
            },
        });
        if (!connection) {
            return { connected: false };
        }
        return {
            connected: true,
            teamId: connection.teamId,
            teamName: connection.teamName,
            channelId: connection.channelId,
            channelName: connection.channelName,
            connectedAt: connection.connectedAt.toISOString(),
        };
    }
    static async disconnectSlack(userId) {
        await prisma.slackConnection.updateMany({
            where: {
                userId,
                disconnectedAt: null,
            },
            data: {
                disconnectedAt: new Date(),
            },
        });
    }
    /**
     * Internal worker method: sends rate-limit notification to the user's active Slack webhook.
     */
    static async sendRateLimitAlert(senderId, hourStart, hourEnd, hourlyLimit, reservedCount) {
        // 1. Find Sender and User
        const sender = await prisma.sender.findUnique({
            where: { id: senderId },
            include: {
                user: {
                    include: {
                        slackConnections: {
                            where: { disconnectedAt: null },
                        },
                    },
                },
            },
        });
        if (!sender || sender.user.slackConnections.length === 0) {
            return false; // No active Slack connection; gracefully skip
        }
        const connection = sender.user.slackConnections[0];
        if (!connection)
            return false;
        const webhookUrl = decryptCredential(connection.webhookUrlEncrypted);
        // Format Block Kit notification
        const payload = {
            blocks: [
                {
                    type: 'header',
                    text: {
                        type: 'plain_text',
                        text: '⚠️ Sender Hourly Rate Limit Reached',
                        emoji: true,
                    },
                },
                {
                    type: 'section',
                    fields: [
                        {
                            type: 'mrkdwn',
                            text: `*Sender:*\n${sender.displayName} (<${sender.fromEmail}>)`,
                        },
                        {
                            type: 'mrkdwn',
                            text: `*Hourly Limit:*\n${hourlyLimit} emails / hr`,
                        },
                        {
                            type: 'mrkdwn',
                            text: `*Window:*\n${new Date(hourStart).toUTCString()} - ${new Date(hourEnd).toUTCString()}`,
                        },
                        {
                            type: 'mrkdwn',
                            text: `*Reserved in Window:*\n${reservedCount} emails`,
                        },
                    ],
                },
                {
                    type: 'context',
                    elements: [
                        {
                            type: 'mrkdwn',
                            text: 'ℹ️ _Subsequent emails have been automatically scheduled into the next available hour slot._',
                        },
                    ],
                },
            ],
        };
        const res = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        return res.ok;
    }
}
//# sourceMappingURL=slack.service.js.map