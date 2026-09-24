import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    env: {
      NODE_ENV: 'test',
      PORT: '4000',
      DATABASE_URL: 'mysql://reachinbox:reachinbox@localhost:3306/reachinbox',
      REDIS_URL: 'redis://localhost:6379',
      ELASTICSEARCH_URL: 'http://localhost:9200',
      SESSION_SECRET: 'test-session-secret-at-least-32-chars-long-123456',
      CREDENTIAL_ENCRYPTION_KEY: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      FRONTEND_URL: 'http://localhost:3000',
      GOOGLE_CLIENT_ID: 'test-google-id',
      GOOGLE_CLIENT_SECRET: 'test-google-secret',
      GOOGLE_CALLBACK_URL: 'http://localhost:4000/api/v1/auth/google/callback',
      SLACK_CLIENT_ID: 'test-slack-id',
      SLACK_CLIENT_SECRET: 'test-slack-secret',
      SLACK_CALLBACK_URL: 'http://localhost:4000/api/v1/slack/callback',
    },
  },
});
