import { Router } from 'express';
import { WebhooksController } from '../controllers/webhooksController.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { enqueueWebhook } from '../queues/webhookQueue.js';

export const webhooksRouter = Router();

// GET /api/webhooks — Get current webhook configuration for org
webhooksRouter.get('/', authenticate, authorize('ADMIN'), WebhooksController.getConfig);

// POST /api/webhooks/configure — Set webhook URL for org
webhooksRouter.post('/configure', authenticate, authorize('ADMIN'), WebhooksController.configure);

// POST /api/webhooks/test — Enqueue a test webhook delivery to verify LMS/ATS connectivity
webhooksRouter.post('/test', authenticate, authorize('ADMIN'), WebhooksController.test);

/**
 * Enqueues a webhook delivery — does not block the caller.
 * Delivery is handled by the dedicated webhookQueue worker with 5 retries.
 */
export async function triggerWebhook(organizationId: string, payload: object): Promise<void> {
  await enqueueWebhook(organizationId, payload);
}
