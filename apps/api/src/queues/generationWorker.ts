import { Worker, type Job } from 'bullmq';
import { redisConnection } from '../utils/redis.js';
import { logger } from '../utils/logger.js';
import { processGenerationItem, failGenerationItem } from '../services/generationService.js';
import type { GenerationJobData } from './generationQueue.js';

/**
 * BullMQ Worker: processes one question per job from the 'generation' queue.
 *
 *  - concurrency: how many questions are worked on in parallel (WORKER_CONCURRENCY, default 5)
 *  - a job that throws (infrastructure failure) is retried with backoff; when the
 *    last attempt fails, the item is marked FAILED with the reason so the UI
 *    never shows it as stuck
 *  - jobs live in Redis, so they survive a worker crash or restart
 */
export function startGenerationWorker() {
  const concurrency = Number(process.env.WORKER_CONCURRENCY ?? 5);

  const worker = new Worker<GenerationJobData>(
    'generation',
    async (job: Job<GenerationJobData>) => {
      logger.info(`[Worker] Processing item ${job.data.itemId} (attempt ${job.attemptsMade + 1})`);
      await processGenerationItem(job.data.itemId);
    },
    {
      connection: redisConnection,
      concurrency,
      // A multi-language validation can legitimately take minutes.
      lockDuration: 120_000,
    }
  );

  worker.on('failed', (job, err) => {
    logger.error(`[Worker] Item ${job?.data.itemId} failed`, { error: err.message, attempts: job?.attemptsMade });
    if (job && job.attemptsMade >= (job.opts.attempts ?? 1)) {
      failGenerationItem(job.data.itemId, `Gave up after ${job.attemptsMade} attempts: ${err.message}`).catch((e) =>
        logger.error('[Worker] Could not record item failure', { error: e.message })
      );
    }
  });

  worker.on('error', (err) => {
    logger.error('[Worker] Worker error', { error: err.message });
  });

  logger.info(`🔧 Generation worker started (concurrency: ${concurrency})`);
  return worker;
}
