import 'dotenv/config';
import { logger } from './utils/logger.js';
import { prisma } from './utils/prisma.js';
import { connectRedis } from './utils/redis.js';
import { startGenerationWorker } from './queues/generationWorker.js';
import { startWebhookWorker } from './queues/webhookQueue.js';

/**
 * Dedicated Background Worker Process
 *
 * Runs BullMQ generation and webhook delivery workers in an isolated Node.js
 * process, completely decoupled from the Express HTTP API. This ensures:
 * 1. Heavy AI generation & sandbox execution never block HTTP requests or health checks.
 * 2. Worker out-of-memory or crash events never bring down the web API.
 * 3. Workers can be scaled independently based on queue depth (e.g. 5 workers, 1 API).
 */
async function startWorker() {
  logger.info('🚀 [Worker Process] Initializing Question Forge Background Worker...');

  await connectRedis();

  const generationWorker = startGenerationWorker();
  const webhookWorker = startWebhookWorker();

  logger.info('✅ [Worker Process] All queue workers active and listening for jobs.');

  const shutdown = async (signal: string) => {
    logger.info(`[Worker Process] Received ${signal}. Draining active jobs...`);

    try {
      await Promise.all([
        generationWorker.close(),
        webhookWorker.close(),
      ]);
      await prisma.$disconnect();
      logger.info('👋 [Worker Process] All queue workers drained and connections closed. Exiting.');
      process.exit(0);
    } catch (err: any) {
      logger.error('[Worker Process] Error during worker shutdown', { error: err.message });
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

startWorker().catch((err) => {
  logger.error('Failed to start worker process', { error: err.message });
  process.exit(1);
});
