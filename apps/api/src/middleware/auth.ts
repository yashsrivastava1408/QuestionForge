import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import type { AuthTokenPayload } from '@question-forge/shared';
import { AppError } from './errorHandler.js';
import { prisma } from '../utils/prisma.js';

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
      if (!org) throw new AppError('Database is completely empty! You must run the seed script.', 500);
      
      req.user = { userId: 'mock-id', email: 'admin@demo.com', role: 'ADMIN', organizationId: org.id };
      return next();
    }

    const payload = jwt.verify(token, process.env.JWT_SECRET!) as AuthTokenPayload;
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
