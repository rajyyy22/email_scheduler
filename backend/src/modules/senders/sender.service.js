import { prisma } from '../../infrastructure/database/prisma.js';
import { encryptCredential, decryptCredential } from '../../infrastructure/security/crypto.js';
import { env } from '../../config/env.js';
export class SenderService {
    static async createSender(userId, data) {
        const encryptedUser = encryptCredential(data.smtpUsername);
        const encryptedPass = encryptCredential(data.smtpPassword);
        const sender = await prisma.sender.create({
            data: {
                userId,
                displayName: data.displayName,
                fromEmail: data.fromEmail,
                fromName: data.fromName,
                smtpHost: data.smtpHost,
                smtpPort: data.smtpPort,
                smtpSecure: data.smtpSecure ?? false,
                smtpUsernameEncrypted: encryptedUser,
                smtpPasswordEncrypted: encryptedPass,
                hourlyLimit: data.hourlyLimit ?? env.DEFAULT_SENDER_HOURLY_LIMIT,
                minimumDelayMs: data.minimumDelayMs ?? env.DEFAULT_MINIMUM_DELAY_MS,
            },
        });
        return {
            id: sender.id,
            displayName: sender.displayName,
            fromEmail: sender.fromEmail,
            fromName: sender.fromName,
            smtpHost: sender.smtpHost,
            smtpPort: sender.smtpPort,
            smtpSecure: sender.smtpSecure,
            hourlyLimit: sender.hourlyLimit,
            minimumDelayMs: sender.minimumDelayMs,
            isActive: sender.isActive,
            createdAt: sender.createdAt.toISOString(),
        };
    }
    static async listSenders(userId, activeOnly = false) {
        const senders = await prisma.sender.findMany({
            where: {
                userId,
                ...(activeOnly ? { isActive: true } : {}),
            },
            orderBy: { createdAt: 'desc' },
        });
        return senders.map((s) => ({
            id: s.id,
            displayName: s.displayName,
            fromEmail: s.fromEmail,
            fromName: s.fromName,
            smtpHost: s.smtpHost,
            smtpPort: s.smtpPort,
            smtpSecure: s.smtpSecure,
            hourlyLimit: s.hourlyLimit,
            minimumDelayMs: s.minimumDelayMs,
            isActive: s.isActive,
            createdAt: s.createdAt.toISOString(),
        }));
    }
    static async updateSender(userId, senderId, data) {
        const existing = await prisma.sender.findFirst({
            where: { id: senderId, userId },
        });
        if (!existing)
            return null;
        const updateData = {};
        if (data.displayName !== undefined)
            updateData.displayName = data.displayName;
        if (data.fromEmail !== undefined)
            updateData.fromEmail = data.fromEmail;
        if (data.fromName !== undefined)
            updateData.fromName = data.fromName;
        if (data.smtpHost !== undefined)
            updateData.smtpHost = data.smtpHost;
        if (data.smtpPort !== undefined)
            updateData.smtpPort = data.smtpPort;
        if (data.smtpSecure !== undefined)
            updateData.smtpSecure = data.smtpSecure;
        if (data.hourlyLimit !== undefined)
            updateData.hourlyLimit = data.hourlyLimit;
        if (data.minimumDelayMs !== undefined)
            updateData.minimumDelayMs = data.minimumDelayMs;
        if (data.isActive !== undefined)
            updateData.isActive = data.isActive;
        if (data.smtpUsername) {
            updateData.smtpUsernameEncrypted = encryptCredential(data.smtpUsername);
        }
        if (data.smtpPassword) {
            updateData.smtpPasswordEncrypted = encryptCredential(data.smtpPassword);
        }
        const updated = await prisma.sender.update({
            where: { id: senderId },
            data: updateData,
        });
        return {
            id: updated.id,
            displayName: updated.displayName,
            fromEmail: updated.fromEmail,
            fromName: updated.fromName,
            smtpHost: updated.smtpHost,
            smtpPort: updated.smtpPort,
            smtpSecure: updated.smtpSecure,
            hourlyLimit: updated.hourlyLimit,
            minimumDelayMs: updated.minimumDelayMs,
            isActive: updated.isActive,
            createdAt: updated.createdAt.toISOString(),
        };
    }
    static async toggleSenderActive(userId, senderId) {
        const existing = await prisma.sender.findFirst({
            where: { id: senderId, userId },
        });
        if (!existing)
            return null;
        const updated = await prisma.sender.update({
            where: { id: senderId },
            data: { isActive: !existing.isActive },
        });
        return {
            id: updated.id,
            displayName: updated.displayName,
            fromEmail: updated.fromEmail,
            fromName: updated.fromName,
            smtpHost: updated.smtpHost,
            smtpPort: updated.smtpPort,
            smtpSecure: updated.smtpSecure,
            hourlyLimit: updated.hourlyLimit,
            minimumDelayMs: updated.minimumDelayMs,
            isActive: updated.isActive,
            createdAt: updated.createdAt.toISOString(),
        };
    }
    static async getSenderById(userId, senderId) {
        const sender = await prisma.sender.findFirst({
            where: {
                id: senderId,
                userId,
            },
        });
        if (!sender)
            return null;
        return {
            id: sender.id,
            displayName: sender.displayName,
            fromEmail: sender.fromEmail,
            fromName: sender.fromName,
            smtpHost: sender.smtpHost,
            smtpPort: sender.smtpPort,
            smtpSecure: sender.smtpSecure,
            hourlyLimit: sender.hourlyLimit,
            minimumDelayMs: sender.minimumDelayMs,
            isActive: sender.isActive,
            createdAt: sender.createdAt.toISOString(),
        };
    }
    /**
     * Internal worker method: securely retrieves and decrypts SMTP credentials.
     */
    static async getDecryptedSenderCredentials(senderId) {
        const sender = await prisma.sender.findUnique({
            where: { id: senderId },
        });
        if (!sender) {
            throw new Error(`Sender not found: ${senderId}`);
        }
        return {
            ...sender,
            smtpUsername: decryptCredential(sender.smtpUsernameEncrypted),
            smtpPassword: decryptCredential(sender.smtpPasswordEncrypted),
        };
    }
}
//# sourceMappingURL=sender.service.js.map