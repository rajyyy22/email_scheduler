import { Request, Response, NextFunction } from 'express';
import { redis } from '../infrastructure/redis/redis.js';
import { AppError } from './error.middleware.js';
import { ErrorCode } from '../types/index.js';

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

export const SESSION_COOKIE_NAME = 'reachinbox_session';

export async function authMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    const queryToken = typeof req.query?.token === 'string' ? (req.query.token as string) : null;
    const sessionId = req.cookies?.[SESSION_COOKIE_NAME] || bearerToken || queryToken;

    if (!sessionId) {
      return next(new AppError(401, ErrorCode.UNAUTHORIZED, 'Authentication required'));
    }

    const rawSession = await redis.get(`session:v1:${sessionId}`);
    if (!rawSession) {
      return next(new AppError(401, ErrorCode.UNAUTHORIZED, 'Session expired or invalid'));
    }

    const user = JSON.parse(rawSession) as AuthenticatedUser;
    req.user = user;
    next();
  } catch (err) {
    if (err instanceof AppError) {
      return next(err);
    }
    return next(new AppError(401, ErrorCode.UNAUTHORIZED, 'Corrupted session data'));
  }
}
