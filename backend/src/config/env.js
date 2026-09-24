import dotenv from 'dotenv';
import { z } from 'zod';
dotenv.config();
const envSchema = z.object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    PORT: z.coerce.number().default(4000),
    FRONTEND_URL: z.string().url().default('http://localhost:3000'),
    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
    REDIS_URL: z.string().min(1, 'REDIS_URL is required'),
    ELASTICSEARCH_URL: z.string().url().default('http://localhost:9200'),
    SESSION_SECRET: z.string().min(32, 'SESSION_SECRET must be at least 32 characters'),
    SESSION_TTL_SECONDS: z.coerce.number().default(604800),
    CREDENTIAL_ENCRYPTION_KEY: z
        .string()
        .length(64, 'CREDENTIAL_ENCRYPTION_KEY must be a 64-char (32-byte) hex string'),
    GOOGLE_CLIENT_ID: z.string().min(1, 'GOOGLE_CLIENT_ID is required'),
    GOOGLE_CLIENT_SECRET: z.string().min(1, 'GOOGLE_CLIENT_SECRET is required'),
    GOOGLE_CALLBACK_URL: z.string().url(),
    SLACK_CLIENT_ID: z.string().min(1, 'SLACK_CLIENT_ID is required'),
    SLACK_CLIENT_SECRET: z.string().min(1, 'SLACK_CLIENT_SECRET is required'),
    SLACK_CALLBACK_URL: z.string().url(),
    EMAIL_WORKER_CONCURRENCY: z.coerce.number().default(20),
    DEFAULT_SENDER_HOURLY_LIMIT: z.coerce.number().default(100),
    DEFAULT_MINIMUM_DELAY_MS: z.coerce.number().default(2000),
    MAX_EMAILS_PER_CAMPAIGN: z.coerce.number().default(5000),
    MAX_CSV_SIZE_BYTES: z.coerce.number().default(5242880), // 5MB
    MAX_SUBJECT_LENGTH: z.coerce.number().default(255),
    MAX_BODY_LENGTH: z.coerce.number().default(100000),
    EMAIL_RETRY_ATTEMPTS: z.coerce.number().default(3),
    EMAIL_RETRY_BASE_DELAY_MS: z.coerce.number().default(5000),
});
function validateEnv() {
    const result = envSchema.safeParse(process.env);
    if (!result.success) {
        console.error('❌ Invalid environment variables:', JSON.stringify(result.error.format(), null, 2));
        throw new Error('Invalid environment configuration');
    }
    return result.data;
}
export const env = validateEnv();
//# sourceMappingURL=env.js.map