import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { redis } from './redis.js';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export class RateLimiterService {
    static scriptSha = null;
    static async initScript() {
        if (!this.scriptSha) {
            const scriptPath = path.join(__dirname, 'rate-limiter.lua');
            const scriptContent = fs.readFileSync(scriptPath, 'utf8');
            this.scriptSha = await redis.script('LOAD', scriptContent);
        }
        return this.scriptSha;
    }
    /**
     * Atomically reserves scheduled slots for a batch of emails for a single sender.
     * All keys use {senderId} hash tags to guarantee execution on a single Redis node/slot.
     */
    static async reserveBatch(senderId, senderMinDelayMs, senderHourlyLimit, items) {
        if (items.length === 0)
            return [];
        const sha = await this.initScript();
        const keys = [
            `rate:v1:{${senderId}}:state`,
            `rate:v1:{${senderId}}:hours`,
            `rate:v1:{${senderId}}:reservations`,
            `rate:v1:{${senderId}}:notifications`,
        ];
        const args = [
            senderMinDelayMs,
            senderHourlyLimit,
            items.length,
        ];
        for (const item of items) {
            args.push(item.reservationId, item.campaignId, item.requestedAtMs, item.campaignHourlyLimit, item.campaignMinimumDelayMs);
        }
        try {
            const rawResults = await redis.evalsha(sha, keys.length, ...keys, ...args);
            return rawResults.map((r) => JSON.parse(r));
        }
        catch (err) {
            // If script was flushed from Redis cache, reload and retry once
            if (err?.message?.includes('NOSCRIPT')) {
                this.scriptSha = null;
                const newSha = await this.initScript();
                const rawResults = await redis.evalsha(newSha, keys.length, ...keys, ...args);
                return rawResults.map((r) => JSON.parse(r));
            }
            throw err;
        }
    }
}
//# sourceMappingURL=rate-limiter.service.js.map