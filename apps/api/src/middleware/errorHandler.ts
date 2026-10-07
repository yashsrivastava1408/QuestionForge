import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { logger } from '../utils/logger.js';

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
) {
  // Bad input is the caller's problem, not a server fault — say exactly what is wrong.
  if (err instanceof ZodError) {
    res.status(400).json({
      success: false,
      error: {
        message: 'Invalid request',
        issues: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      },
    });
    return;
  }

  const isAppError = err instanceof AppError;
  const statusCode = isAppError ? err.statusCode : 500;

  if (statusCode >= 500) {
    logger.error('Unhandled error', {
      message: err.message,
      stack: err.stack,
      path: req.path,
      method: req.method,
    });
  }

  // AppError messages are written for the client. Anything else may leak internals,
  // so it is hidden in production.
  const exposeMessage = (isAppError && statusCode < 500) || process.env.NODE_ENV !== 'production';
  res.status(statusCode).json({
    success: false,
    error: {
      message: exposeMessage ? err.message : 'An internal server error occurred',
      ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
    },
  });
}

export class AppError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500
  ) {
    super(message);
    this.name = 'AppError';
  }
}
