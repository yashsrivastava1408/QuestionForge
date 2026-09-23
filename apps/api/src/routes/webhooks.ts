import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../utils/prisma.js';
import { authenticate, authorize } from '../middleware/auth.js';
import crypto from 'crypto';
import { enqueueWebhook } from '../queues/webhookQueue.js';

export const webhooksRouter = Router();

// POST /api/webhooks/configure — Set webhook URL for org
webhooksRouter.post('/configure', authenticate, authorize('ADMIN'), async (req, res, next) => {
  try {
    const { webhookUrl } = z.object({ webhookUrl: z.string().url() }).parse(req.body);
    const webhookSecret = crypto.randomBytes(32).toString('hex');

    await prisma.organization.update({
      where: { id: req.user!.organizationId },
      data: { webhookUrl, webhookSecret },
    });

    res.json({
      success: true,
      webhookSecret,
      message: 'Webhook configured. Store your secret securely — it will not be shown again.',
    });
  } catch (err) { next(err); }
});

/**
 * Enqueues a webhook delivery — does not block the caller.
 * Delivery is handled by the dedicated webhookQueue worker with 5 retries.
 * Replaces the old synchronous fetch() call inside the generation pipeline.
 */
export async function triggerWebhook(organizationId: string, payload: object): Promise<void> {
  await enqueueWebhook(organizationId, payload);
}
