import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { ErrorCode, type StandardErrorResponse } from '../types/index.js';

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: ErrorCode | string,
    message: string,
    public readonly details?: Array<{ field?: string; reason: string }>,
  ) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export function errorMiddleware(
  err: any,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const requestId = req.id || 'unknown';

  if (err instanceof ZodError) {
    const response: StandardErrorResponse = {
      error: {
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Input validation failed',
        details: err.errors.map((e) => ({
          field: e.path.join('.'),
          reason: e.message,
        })),
      },
      requestId,
    };
    res.status(400).json(response);
    return;
  }

  if (err instanceof AppError) {
    const response: StandardErrorResponse = {
      error: {
        code: err.code,
        message: err.message,
        details: err.details,
      },
      requestId,
    };
    res.status(err.statusCode).json(response);
    return;
  }

  console.error(`[Unhandled Error] [ReqID: ${requestId}]`, err);

  const response: StandardErrorResponse = {
    error: {
      code: ErrorCode.INTERNAL_ERROR,
      message: 'An unexpected internal error occurred',
    },
    requestId,
  };
  res.status(500).json(response);
}
