import type { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../utils/prisma.js';
import { AppError } from '../middleware/errorHandler.js';
import { redisClient } from '../utils/redis.js';

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  organizationSlug: z.string(),
});

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(2),
  organizationSlug: z.string(),
  role: z.enum(['ADMIN', 'REVIEWER', 'GENERATOR']).optional(),
});

export class AuthController {
  static async login(req: Request, res: Response, next: NextFunction) {
    try {
      const { email, password, organizationSlug } = loginSchema.parse(req.body);
      const org = await prisma.organization.findUnique({ where: { slug: organizationSlug } });
      if (!org) throw new AppError('Organization not found', 404);

      const user = await prisma.user.findFirst({
        where: { email, organizationId: org.id },
      });
      if (!user || !user.passwordHash) throw new AppError('Invalid credentials', 401);

      const valid = await bcrypt.compare(password, user.passwordHash);
      if (!valid) throw new AppError('Invalid credentials', 401);

      const jti = uuidv4();
      const token = jwt.sign(
        { userId: user.id, email: user.email, role: user.role, organizationId: user.organizationId, jti },
        process.env.JWT_SECRET!,
        { expiresIn: '24h' }
      );

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

  static async register(req: Request, res: Response, next: NextFunction) {
    try {
      const { email, password, name, organizationSlug, role } = registerSchema.parse(req.body);
      const org = await prisma.organization.findUnique({ where: { slug: organizationSlug } });
      if (!org) throw new AppError('Organization not found', 404);

      const existing = await prisma.user.findFirst({ where: { email, organizationId: org.id } });
      if (existing) throw new AppError('User already exists', 409);

      const passwordHash = await bcrypt.hash(password, 12);
      const user = await prisma.user.create({
        data: { email, passwordHash, name, role: role ?? 'REVIEWER', organizationId: org.id },
      });

      const jti = uuidv4();
      const token = jwt.sign(
        { userId: user.id, email: user.email, role: user.role, organizationId: user.organizationId, jti },
        process.env.JWT_SECRET!,
        { expiresIn: '24h' }
      );

      res.status(201).json({
        success: true,
        token,
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
