import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../utils/prisma.js';
import { AppError } from '../middleware/errorHandler.js';
import { generationQueue } from '../queues/generationQueue.js';
import { webhookQueue } from '../queues/webhookQueue.js';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { invalidateUserTokensBefore } from '../middleware/auth.js';
import { redisClient } from '../utils/redis.js';
import { encryptSecret } from '../utils/crypto.js';
import { LLM_PROVIDERS, modelFor, resolveApiKey, type OrgLlmKeys } from '../services/llmService.js';

export const BULL_BOARD_TICKET_PREFIX = 'bullboard:ticket:';

export class AdminController {
  static async createOrganization(req: Request, res: Response, next: NextFunction) {
    try {
      // Creating a tenant is an operator action, not something any organization's admin
      // should be able to do. Operators are named in SUPERADMIN_EMAILS (comma-separated).
      const superadmins = (process.env.SUPERADMIN_EMAILS ?? '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
      if (!superadmins.includes(req.user!.email.toLowerCase())) {
        throw new AppError('Only a platform operator (SUPERADMIN_EMAILS) can create organizations', 403);
      }

      const { name, slug } = z.object({
        name: z.string().min(2),
        slug: z.string().min(2).regex(/^[a-z0-9-]+$/),
      }).parse(req.body);

      const org = await prisma.organization.create({ data: { name, slug } });
      res.status(201).json({ success: true, organization: org });
    } catch (err) { next(err); }
  }

  static async getAuditLogs(req: Request, res: Response, next: NextFunction) {
    try {
      const { page = '1', limit = '50', action } = req.query;
      const skip = (Number(page) - 1) * Number(limit);
      const where: any = { organizationId: req.user!.organizationId };
      if (action) where.action = action;

      const [logs, total] = await Promise.all([
        prisma.auditLog.findMany({
          where,
          skip,
          take: Number(limit),
          orderBy: { createdAt: 'desc' },
          include: { user: { select: { name: true, email: true } } },
        }),
        prisma.auditLog.count({ where }),
      ]);

      res.json({ success: true, logs, pagination: { total, page: Number(page), limit: Number(limit) } });
    } catch (err) { next(err); }
  }

  static async listUsers(req: Request, res: Response, next: NextFunction) {
    try {
      const users = await prisma.user.findMany({
        where: { organizationId: req.user!.organizationId },
        select: { id: true, name: true, email: true, role: true, isActive: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      });
      res.json({ success: true, users });
    } catch (err) { next(err); }
  }

  /** An organization must always keep at least one active admin, or nobody can manage it. */
  private static async assertNotLastAdmin(organizationId: string, userId: string) {
    const otherAdmins = await prisma.user.count({
      where: { organizationId, role: 'ADMIN', isActive: true, id: { not: userId } },
    });
    if (otherAdmins === 0) throw new AppError('This is the only active admin. Make someone else an admin first.', 400);
  }

  static async updateUserRole(req: Request, res: Response, next: NextFunction) {
    try {
      const { role } = z.object({ role: z.enum(['ADMIN', 'REVIEWER', 'GENERATOR']) }).parse(req.body);

      const target = await prisma.user.findFirst({
        where: { id: req.params.id, organizationId: req.user!.organizationId },
      });
      if (!target) throw new AppError('User not found', 404);
      if (target.role === 'ADMIN' && role !== 'ADMIN') {
        await AdminController.assertNotLastAdmin(target.organizationId, target.id);
      }

      const user = await prisma.user.update({
        where: { id: req.params.id },
        data: { role },
        select: { id: true, name: true, email: true, role: true, isActive: true },
      });
      // The role is baked into the JWT, so existing tokens must stop working.
      if (target.role !== role) await invalidateUserTokensBefore(user.id, Math.floor(Date.now() / 1000) + 1);

      await prisma.auditLog.create({
        data: {
          organizationId: req.user!.organizationId, userId: req.user!.userId, action: 'USER_UPDATED',
          entityType: 'User', entityId: user.id, metadata: { role }, ipAddress: req.ip,
        },
      });
      res.json({ success: true, user });
    } catch (err) { next(err); }
  }

  /** PATCH /api/admin/users/:id/status — deactivate or reactivate an account. */
  static async setUserActive(req: Request, res: Response, next: NextFunction) {
    try {
      const { isActive } = z.object({ isActive: z.boolean() }).parse(req.body);
      const target = await prisma.user.findFirst({
        where: { id: req.params.id, organizationId: req.user!.organizationId },
      });
      if (!target) throw new AppError('User not found', 404);
      if (!isActive) {
        if (target.id === req.user!.userId) throw new AppError('You cannot deactivate your own account', 400);
        if (target.role === 'ADMIN') await AdminController.assertNotLastAdmin(target.organizationId, target.id);
      }

      const user = await prisma.user.update({
        where: { id: target.id },
        data: { isActive },
        select: { id: true, name: true, email: true, role: true, isActive: true },
      });
      // Deactivation takes effect immediately: tokens already issued are void.
      if (!isActive) await invalidateUserTokensBefore(user.id, Math.floor(Date.now() / 1000) + 1);

      await prisma.auditLog.create({
        data: {
          organizationId: req.user!.organizationId, userId: req.user!.userId, action: 'USER_UPDATED',
          entityType: 'User', entityId: user.id, metadata: { isActive }, ipAddress: req.ip,
        },
      });
      res.json({ success: true, user });
    } catch (err) { next(err); }
  }

  /** POST /api/admin/users/:id/reset-password — set a new password for a user and sign them out everywhere. */
  static async resetUserPassword(req: Request, res: Response, next: NextFunction) {
    try {
      const { newPassword } = z.object({ newPassword: z.string().min(8).max(200) }).parse(req.body);
      const target = await prisma.user.findFirst({
        where: { id: req.params.id, organizationId: req.user!.organizationId },
      });
      if (!target) throw new AppError('User not found', 404);

      await prisma.user.update({ where: { id: target.id }, data: { passwordHash: await bcrypt.hash(newPassword, 12) } });
      await invalidateUserTokensBefore(target.id, Math.floor(Date.now() / 1000) + 1);

      await prisma.auditLog.create({
        data: {
          organizationId: req.user!.organizationId, userId: req.user!.userId, action: 'PASSWORD_CHANGED',
          entityType: 'User', entityId: target.id, metadata: { resetByAdmin: true }, ipAddress: req.ip,
        },
      });
      res.json({ success: true, message: `Password reset for ${target.email}. They have been signed out.` });
    } catch (err) { next(err); }
  }

  static async getQueueStats(_req: Request, res: Response, next: NextFunction) {
    try {
      const [generationCounts, webhookCounts] = await Promise.all([
        generationQueue.getJobCounts('active', 'waiting', 'completed', 'failed', 'delayed'),
        webhookQueue.getJobCounts('active', 'waiting', 'completed', 'failed', 'delayed'),
      ]);

      res.json({
        success: true,
        timestamp: new Date().toISOString(),
        queues: {
          generation: {
            name: 'generation',
            counts: generationCounts,
          },
          webhooks: {
            name: 'webhooks',
            counts: webhookCounts,
          },
        },
      });
    } catch (err) { next(err); }
  }

  /**
   * POST /api/admin/queues/ticket — one-time, 60-second ticket for opening the
   * Bull Board UI in a new tab. A browser navigation cannot send an
   * Authorization header, and putting the real JWT in the URL would leak it
   * into logs and history; the ticket is useless after its single use.
   */
  static async createQueueDashboardTicket(req: Request, res: Response, next: NextFunction) {
    try {
      const ticket = crypto.randomBytes(32).toString('hex');
      await redisClient.set(
        `${BULL_BOARD_TICKET_PREFIX}${ticket}`,
        JSON.stringify({ userId: req.user!.userId, organizationId: req.user!.organizationId }),
        'EX',
        60
      );
      res.json({ success: true, url: `/admin/queues?ticket=${ticket}`, expiresInSeconds: 60 });
    } catch (err) { next(err); }
  }

  /** GET /api/admin/llm-keys — which providers are usable, and whether the key is the org's own. Never returns a key. */
  static async getLlmKeys(req: Request, res: Response, next: NextFunction) {
    try {
      const org = await prisma.organization.findUnique({
        where: { id: req.user!.organizationId },
        select: { llmApiKeysEncrypted: true },
      });
      const orgKeys = (org?.llmApiKeysEncrypted ?? null) as OrgLlmKeys;
      const providers = LLM_PROVIDERS.map((provider) => {
        const resolved = resolveApiKey(provider, orgKeys);
        return {
          provider,
          model: modelFor(provider),
          configured: !!resolved,
          source: resolved?.source ?? null, // 'org' = this organization's own key, 'env' = server-wide key
          last4: resolved?.source === 'org' ? resolved.key.slice(-4) : null,
        };
      });
      res.json({ success: true, providers });
    } catch (err) { next(err); }
  }

  /** PUT /api/admin/llm-keys — set (or with apiKey: null, remove) this organization's own key for a provider. */
  static async setLlmKey(req: Request, res: Response, next: NextFunction) {
    try {
      const { provider, apiKey } = z.object({
        provider: z.enum(['anthropic', 'openai', 'gemini']),
        apiKey: z.string().trim().min(10).max(400).nullable(),
      }).parse(req.body);

      const org = await prisma.organization.findUnique({
        where: { id: req.user!.organizationId },
        select: { llmApiKeysEncrypted: true },
      });
      const keys: Record<string, string> = { ...((org?.llmApiKeysEncrypted as Record<string, string> | null) ?? {}) };
      if (apiKey === null) delete keys[provider];
      else keys[provider] = encryptSecret(apiKey);

      await prisma.organization.update({
        where: { id: req.user!.organizationId },
        data: { llmApiKeysEncrypted: keys },
      });
      await prisma.auditLog.create({
        data: {
          organizationId: req.user!.organizationId,
          userId: req.user!.userId,
          action: 'API_KEY_UPDATED',
          metadata: { provider, removed: apiKey === null },
          ipAddress: req.ip,
        },
      });

      res.json({ success: true, provider, configured: apiKey !== null });
    } catch (err) { next(err); }
  }
}
