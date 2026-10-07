import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import type { AuthTokenPayload } from '@question-forge/shared';
import { AppError } from './errorHandler.js';
import { prisma } from '../utils/prisma.js';
import { redisClient } from '../utils/redis.js';
import { isMockAuthEnabled } from '../utils/config.js';

declare global {
  namespace Express {
    interface Request {
      user?: AuthTokenPayload;
    }
  }
}

const TOKEN_LIFETIME_SECONDS = 24 * 3600;

export const userTokensValidAfterKey = (userId: string) => `user:tokens-valid-after:${userId}`;

/**
 * Voids every token issued to a user before `issuedAt` (unix seconds). Tokens
 * live 24h, so the marker only needs to outlive that.
 */
export async function invalidateUserTokensBefore(userId: string, issuedAt: number): Promise<void> {
  await redisClient.set(userTokensValidAfterKey(userId), String(issuedAt), 'EX', TOKEN_LIFETIME_SECONDS + 3600);
}

export async function authenticate(req: Request, _res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7).trim() : undefined;
    if (!token) throw new AppError('Authentication required', 401);

    // Dev-only shortcut, off unless ALLOW_MOCK_AUTH=true and never in production.
    if (token === 'mock-token' && isMockAuthEnabled()) {
      const user = await prisma.user.findFirst({ where: { role: 'ADMIN' }, orderBy: { createdAt: 'asc' } });
      if (!user) throw new AppError('No admin user in the database. Run: npm run db:seed', 500);
      req.user = { userId: user.id, email: user.email, role: 'ADMIN', organizationId: user.organizationId };
      return next();
    }

    const payload = jwt.verify(token, process.env.JWT_SECRET!) as AuthTokenPayload & { jti?: string; scope?: string; iat?: number };

    // Tokens minted for a single purpose (e.g. the Bull Board session) are not API logins.
    if (payload.scope) throw new AppError('Invalid or expired token', 401);

    // One round-trip for both checks:
    //  - the token itself was revoked (logout), or
    //  - every token issued to this user before a point in time is void
    //    (password change/reset, account deactivated).
    const [isRevoked, validAfter] = await redisClient.mget(
      `jwt:revoked:${payload.jti ?? '-'}`,
      userTokensValidAfterKey(payload.userId)
    );
    if (isRevoked) throw new AppError('Token has been revoked. Please log in again.', 401);
    if (validAfter && (payload.iat ?? 0) < Number(validAfter)) {
      throw new AppError('Your session is no longer valid. Please log in again.', 401);
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
