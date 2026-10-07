import type { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../utils/prisma.js';
import { AppError } from '../middleware/errorHandler.js';
import { redisClient } from '../utils/redis.js';
import { invalidateUserTokensBefore } from '../middleware/auth.js';

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  organizationSlug: z.string(),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(200),
});

function signToken(user: { id: string; email: string; role: string; organizationId: string }) {
  return jwt.sign(
    { userId: user.id, email: user.email, role: user.role, organizationId: user.organizationId, jti: uuidv4() },
    process.env.JWT_SECRET!,
    { expiresIn: '24h' }
  );
}

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(2),
  role: z.enum(['ADMIN', 'REVIEWER', 'GENERATOR']).optional(),
});

export class AuthController {
  static async login(req: Request, res: Response, next: NextFunction) {
    try {
      const { email, password, organizationSlug } = loginSchema.parse(req.body);
      // One generic error for every failure, so the endpoint cannot be used to
      // discover which organizations or accounts exist.
      const org = await prisma.organization.findUnique({ where: { slug: organizationSlug } });
      if (!org) throw new AppError('Invalid credentials', 401);

      const user = await prisma.user.findFirst({
        where: { email, organizationId: org.id },
      });
      if (!user || !user.passwordHash) throw new AppError('Invalid credentials', 401);

      const valid = await bcrypt.compare(password, user.passwordHash);
      // A deactivated account gets the same answer as a wrong password.
      if (!valid || !user.isActive) throw new AppError('Invalid credentials', 401);

      const token = signToken(user);

      await prisma.auditLog.create({
        data: {
          organizationId: org.id,
          userId: user.id,
          action: 'USER_LOGIN',
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
        },
      });

      res.json({
        success: true,
        token,
        user: { id: user.id, email: user.email, name: user.name, role: user.role },
      });
    } catch (err) { next(err); }
  }

  /**
   * Creates a user in the CALLER's organization. Admin-only: there is no public
   * sign-up. (This used to be an open endpoint that accepted any organization
   * slug and `role: "ADMIN"` — i.e. anyone could make themselves an admin of
   * any tenant.) The first admin of an organization comes from `npm run db:seed`.
   */
  static async register(req: Request, res: Response, next: NextFunction) {
    try {
      const { email, password, name, role } = registerSchema.parse(req.body);
      const organizationId = req.user!.organizationId;

      // User.email is globally unique in the schema.
      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing) throw new AppError('A user with this email already exists', 409);

      const passwordHash = await bcrypt.hash(password, 12);
      const user = await prisma.user.create({
        data: { email, passwordHash, name, role: role ?? 'REVIEWER', organizationId },
      });

      await prisma.auditLog.create({
        data: {
          organizationId,
          userId: req.user!.userId,
          action: 'USER_CREATED',
          entityType: 'User',
          entityId: user.id,
          metadata: { email: user.email, role: user.role },
          ipAddress: req.ip,
        },
      });

      res.status(201).json({
        success: true,
        user: { id: user.id, email: user.email, name: user.name, role: user.role },
      });
    } catch (err) { next(err); }
  }

  static async logout(req: Request, res: Response, next: NextFunction) {
    try {
      const token = req.headers.authorization?.replace('Bearer ', '');
      if (token) {
        const payload = jwt.decode(token) as any;
        if (payload?.jti && payload?.exp) {
          const ttlSeconds = payload.exp - Math.floor(Date.now() / 1000);
          if (ttlSeconds > 0) {
            await redisClient.set(`jwt:revoked:${payload.jti}`, '1', 'EX', ttlSeconds);
          }
        }
      }

      await prisma.auditLog.create({
        data: {
          organizationId: req.user!.organizationId,
          userId: req.user!.userId,
          action: 'USER_LOGOUT',
          ipAddress: req.ip,
        },
      });

      res.json({ success: true, message: 'Logged out successfully.' });
    } catch (err) { next(err); }
  }

  /**
   * POST /api/auth/change-password — the user changes their own password.
   * Every other session of theirs is signed out; this one gets a fresh token.
   */
  static async changePassword(req: Request, res: Response, next: NextFunction) {
    try {
      const { currentPassword, newPassword } = changePasswordSchema.parse(req.body);
      const user = await prisma.user.findUnique({ where: { id: req.user!.userId } });
      if (!user?.passwordHash || !(await bcrypt.compare(currentPassword, user.passwordHash))) {
        throw new AppError('Current password is incorrect', 400);
      }
      if (currentPassword === newPassword) {
        throw new AppError('The new password must be different from the current one', 400);
      }

      await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(newPassword, 12) } });

      const token = signToken(user);
      const { iat } = jwt.decode(token) as { iat: number };
      await invalidateUserTokensBefore(user.id, iat);

      await prisma.auditLog.create({
        data: {
          organizationId: user.organizationId,
          userId: user.id,
          action: 'PASSWORD_CHANGED',
          entityType: 'User',
          entityId: user.id,
          ipAddress: req.ip,
        },
      });

      res.json({ success: true, token, message: 'Password changed. Other sessions were signed out.' });
    } catch (err) { next(err); }
  }

  static async me(req: Request, res: Response, next: NextFunction) {
    try {
      const user = await prisma.user.findUnique({
        where: { id: req.user!.userId },
        select: { id: true, email: true, name: true, role: true, organizationId: true, createdAt: true },
      });
      if (!user) throw new AppError('User not found', 404);
      res.json({ success: true, user });
    } catch (err) { next(err); }
  }
}
