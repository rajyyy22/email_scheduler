import { ZodError } from 'zod';
import { ErrorCode } from '@reachinbox/shared-types';
export class AppError extends Error {
    statusCode;
    code;
    details;
    constructor(statusCode, code, message, details) {
        super(message);
        this.statusCode = statusCode;
        this.code = code;
        this.details = details;
        Object.setPrototypeOf(this, new.target.prototype);
    }
}
export function errorMiddleware(err, req, res, _next) {
    const requestId = req.id || 'unknown';
    if (err instanceof ZodError) {
        const response = {
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
        const response = {
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
    const response = {
        error: {
            code: ErrorCode.INTERNAL_ERROR,
            message: 'An unexpected internal error occurred',
        },
        requestId,
    };
    res.status(500).json(response);
}
//# sourceMappingURL=error.middleware.js.map