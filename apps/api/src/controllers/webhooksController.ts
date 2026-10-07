import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../utils/prisma.js';
import { AppError } from '../middleware/errorHandler.js';
import crypto from 'crypto';
import { enqueueWebhook } from '../queues/webhookQueue.js';
import { assertPublicHttpUrl } from '../utils/urlSafety.js';
import { encryptSecret } from '../utils/crypto.js';

export class WebhooksController {
  static async getConfig(req: Request, res: Response, next: NextFunction) {
    try {
      const org = await prisma.organization.findUnique({
        where: { id: req.user!.organizationId },
        select: { webhookUrl: true, webhookSecret: true, updatedAt: true },
      });
      if (!org) throw new AppError('Organization not found', 404);

      res.json({
        success: true,
        configured: Boolean(org.webhookUrl),
        webhookUrl: org.webhookUrl ?? '',
        hasSecret: Boolean(org.webhookSecret),
        updatedAt: org.updatedAt,
      });
    } catch (err) { next(err); }
  }

  static async configure(req: Request, res: Response, next: NextFunction) {
    try {
      const { webhookUrl } = z.object({ webhookUrl: z.string().url() }).parse(req.body);
      // SSRF guard: the server will POST to this URL, so it must be a public address.
      await assertPublicHttpUrl(webhookUrl);
      const webhookSecret = crypto.randomBytes(32).toString('hex');

      // Shown to the admin once (below); stored encrypted.
      await prisma.organization.update({
        where: { id: req.user!.organizationId },
        data: { webhookUrl, webhookSecret: encryptSecret(webhookSecret) },
      });

      res.json({
        success: true,
        webhookSecret,
        message: 'Webhook configured. Store your secret securely — it will not be shown again.',
      });
    } catch (err) { next(err); }
  }

  static async test(req: Request, res: Response, next: NextFunction) {
    try {
      const org = await prisma.organization.findUnique({
        where: { id: req.user!.organizationId },
        select: { webhookUrl: true },
      });

      if (!org?.webhookUrl) {
        throw new AppError('No webhook URL configured for this organization. Please configure one first.', 400);
      }

      const payload = {
        event: 'webhook.ping',
        timestamp: new Date().toISOString(),
        organizationId: req.user!.organizationId,
        data: {
          message: 'Question Forge Webhook Connection Test',
          triggeredBy: req.user!.email,
        },
      };

      await enqueueWebhook(req.user!.organizationId, payload);

      res.json({
        success: true,
        message: `Test ping enqueued for delivery to ${org.webhookUrl}`,
      });
    } catch (err) { next(err); }
  }
}
