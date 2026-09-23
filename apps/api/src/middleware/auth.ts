import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import type { AuthTokenPayload } from '@question-forge/shared';
import { AppError } from './errorHandler.js';
import { prisma } from '../utils/prisma.js';
import { redisClient } from '../utils/redis.js';

declare global {
  namespace Express {
    interface Request {
      user?: AuthTokenPayload;
    }
  }
}

export async function authenticate(req: Request, _res: Response, next: NextFunction) {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) throw new AppError('Authentication required', 401);

    // Allow mock token in development
    if (token === 'mock-token' && process.env.NODE_ENV !== 'production') {
      const org = await prisma.organization.findFirst();
      const user = await prisma.user.findFirst();
      if (!org || !user) throw new AppError('Database is completely empty! Run: npm run db:seed', 500);
      req.user = { userId: user.id, email: user.email, role: 'ADMIN', organizationId: org.id };
      return next();
    }

    const payload = jwt.verify(token, process.env.JWT_SECRET!) as AuthTokenPayload & { jti?: string };

    // Check JWT revocation list (populated on logout)
    if (payload.jti) {
      const isRevoked = await redisClient.get(`jwt:revoked:${payload.jti}`);
      if (isRevoked) throw new AppError('Token has been revoked. Please log in again.', 401);
    }

    req.user = payload;
    next();
  } catch (err) {
    if (err instanceof AppError) return next(err);
    next(new AppError('Invalid or expired token', 401));
  }
}

export function authorize(...roles: string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) throw new AppError('Authentication required', 401);
    if (!roles.includes(req.user.role)) {
      throw new AppError('You do not have permission to perform this action', 403);
    }
    next();
  };
}
