import { Queue, Worker, type Job } from 'bullmq';
import { redisConnection } from '../utils/redis.js';
import { logger } from '../utils/logger.js';
import { prisma } from '../utils/prisma.js';
import crypto from 'crypto';

export interface WebhookJobData {
  organizationId: string;
  payload: object;
}

/**
 * BullMQ Queue for outgoing webhook deliveries.
 * Keeping webhook delivery separate from the generation queue means:
 *  - A slow or down customer endpoint cannot stall question generation.
 *  - Failed deliveries are retried independently (up to 5 times, exponential backoff).
 */
export const webhookQueue = new Queue<WebhookJobData>('webhooks', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: 'exponential', delay: 2000 }, // 2s, 4s, 8s, 16s, 32s
    removeOnComplete: { age: 3600 },
    removeOnFail: { age: 7 * 24 * 3600 },
  },
});

/**
 * Enqueues a webhook delivery job — fire-and-forget from the caller's perspective.
 */
export async function enqueueWebhook(organizationId: string, payload: object): Promise<void> {
  await webhookQueue.add('deliver', { organizationId, payload });
}

/**
 * Starts the webhook delivery worker.
 * Uses native fetch (Node 18+) — no node-fetch dependency required.
 */
export function startWebhookWorker() {
  const worker = new Worker<WebhookJobData>(
    'webhooks',
    async (job: Job<WebhookJobData>) => {
      const { organizationId, payload } = job.data;

      const org = await prisma.organization.findUnique({
        where: { id: organizationId },
        select: { webhookUrl: true, webhookSecret: true },
      });
      if (!org?.webhookUrl) return; // Webhook removed after job was enqueued — skip

      const body = JSON.stringify(payload);
      const sig = crypto
        .createHmac('sha256', org.webhookSecret!)
        .update(body)
        .digest('hex');

      const response = await fetch(org.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-QuestionForge-Signature': `sha256=${sig}`,
          'X-QuestionForge-Attempt': String(job.attemptsMade + 1),
        },
        body,
        signal: AbortSignal.timeout(10_000), // 10s hard timeout per attempt
      });

      if (!response.ok) {
        // Non-2xx forces BullMQ to retry the job
        throw new Error(`Webhook delivery failed: ${response.status} ${response.statusText}`);
      }

      await prisma.auditLog.create({
        data: {
          organizationId,
          action: 'WEBHOOK_TRIGGERED',
          metadata: { url: org.webhookUrl, event: (payload as any).event, attempt: job.attemptsMade + 1 },
        },
      });

      logger.info(`[Webhook] Delivered ${(payload as any).event} to ${org.webhookUrl}`);
    },
    { connection: redisConnection, concurrency: 10 }
  );

  worker.on('failed', (job, err) => {
    logger.error(`[Webhook] Delivery failed for job ${job?.id}`, { error: err.message });
  });

  logger.info('🔔 Webhook worker started');
  return worker;
}
