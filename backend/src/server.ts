import http from 'http';
import { createApp } from './app.js';
import { env } from './config/env.js';
import { prisma } from './infrastructure/database/prisma.js';
import { redis } from './infrastructure/redis/redis.js';
import { initElasticsearchIndex } from './infrastructure/elasticsearch/es-client.js';

async function bootstrap() {
  const app = createApp();
  const server = http.createServer(app);

  // Initialize Elasticsearch index mapping asynchronously
  initElasticsearchIndex().catch((err) => {
    console.warn('Initial Elasticsearch index check failed:', err.message);
  });

  server.listen(env.PORT, () => {
    console.log(`🚀 ReachInbox API server listening on http://localhost:${env.PORT}`);
    console.log(`📡 Health Check: http://localhost:${env.PORT}/health/ready`);
    console.log(`📊 Bull Board: http://localhost:${env.PORT}/admin/queues`);
  });

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    console.log(`\n${signal} received. Initiating graceful shutdown...`);
    server.close(async () => {
      console.log('HTTP server closed.');
      try {
        await redis.quit();
        console.log('Redis connection closed.');
        await prisma.$disconnect();
        console.log('MySQL connection pool closed.');
        process.exit(0);
      } catch (err) {
        console.error('Error during shutdown:', err);
        process.exit(1);
      }
    });

    // Force shutdown after 10s if dangling connections remain
    setTimeout(() => {
      console.error('Forcefully terminating process after timeout.');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

bootstrap().catch((err) => {
  console.error('Fatal bootstrap error:', err);
  process.exit(1);
});
