import { Request, Response } from 'express';
import { prisma } from '../../infrastructure/database/prisma.js';
import { redis } from '../../infrastructure/redis/redis.js';
import { esClient } from '../../infrastructure/elasticsearch/es-client.js';

export class HealthController {
  public static liveness(_req: Request, res: Response): void {
    res.json({ status: 'UP', timestamp: new Date().toISOString() });
  }

  public static async readiness(_req: Request, res: Response): Promise<void> {
    const checks: Record<string, string> = {
      mysql: 'DOWN',
      redis: 'DOWN',
      elasticsearch: 'DOWN',
    };

    let allHealthy = true;

    // Check MySQL
    try {
      await prisma.$queryRaw`SELECT 1`;
      checks.mysql = 'UP';
    } catch (err) {
      allHealthy = false;
    }

    // Check Redis
    try {
      const ping = await redis.ping();
      if (ping === 'PONG') checks.redis = 'UP';
      else allHealthy = false;
    } catch (err) {
      allHealthy = false;
    }

    // Check Elasticsearch
    try {
      const esPing = await esClient.ping();
      if (esPing) checks.elasticsearch = 'UP';
      else allHealthy = false;
    } catch (err) {
      // Elasticsearch failure is monitored, but let's report status accurately
      checks.elasticsearch = 'DOWN';
    }

    const statusCode = allHealthy ? 200 : 503;
    res.status(statusCode).json({
      status: allHealthy ? 'UP' : 'DEGRADED',
      timestamp: new Date().toISOString(),
      checks,
    });
  }
}
