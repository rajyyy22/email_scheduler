import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { prisma } from '../infrastructure/database/prisma.js';
import { AppError } from './error.middleware.js';
import { ErrorCode } from '../types/index.js';

export function idempotencyMiddleware() {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const idempotencyKey = req.headers['idempotency-key'] as string;

    if (!idempotencyKey) {
      // Idempotency key is optional for generic requests, but required for campaigns
      return next();
    }

    const userId = req.user?.id;
    if (!userId) {
      return next();
    }

    // Compute deterministic request hash
    const bodyStr = JSON.stringify(req.body || {});
    const requestHash = crypto.createHash('sha256').update(bodyStr).digest('hex');

    const existingRecord = await prisma.idempotencyKey.findUnique({
      where: {
        uq_user_idempotency: {
          userId,
          idempotencyKey,
        },
      },
    });

    if (existingRecord) {
      if (existingRecord.requestHash !== requestHash) {
        return next(
          new AppError(
            422,
            ErrorCode.IDEMPOTENCY_MISMATCH,
            'Idempotency-Key was already used with a different request body',
          ),
        );
      }

      // Replay original cached response
      res.status(existingRecord.responseStatus).json(JSON.parse(existingRecord.responseBody));
      return;
    }

    // Intercept res.send/res.json to record response on completion
    const originalJson = res.json.bind(res);
    res.json = (body: any): Response => {
      // Fire-and-forget record creation or await in background
      const statusCode = res.statusCode;
      const expiresAt = new Date(Date.now() + 86400 * 1000); // 24-hour expiry

      prisma.idempotencyKey
        .create({
          data: {
            userId,
            idempotencyKey,
            requestHash,
            responseStatus: statusCode,
            responseBody: JSON.stringify(body),
            expiresAt,
          },
        })
        .catch((err: unknown) => {
          console.error('Failed to persist idempotency key record:', err);
        });

      return originalJson(body);
    };

    next();
  };
}
