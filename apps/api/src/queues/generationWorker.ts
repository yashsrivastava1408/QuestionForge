import { Worker, type Job } from 'bullmq';
import { redisConnection } from '../utils/redis.js';
import { logger } from '../utils/logger.js';
import { _runPipelineAsync } from '../services/generationService.js';
import type { GenerationJobData } from './generationQueue.js';

/**
 * BullMQ Worker: processes generation jobs from the 'generation' queue.
 *
 * Key properties:
 *  - concurrency: 5 — runs up to 5 jobs in parallel (tunable via env var)
 *  - Automatically retries on failure (up to 3 attempts, exponential backoff)
 *  - Jobs survive server crashes — they are re-queued on worker restart
 */
export function startGenerationWorker() {
  const concurrency = Number(process.env.WORKER_CONCURRENCY ?? 5);

  const worker = new Worker<GenerationJobData>(
    'generation',
    async (job: Job<GenerationJobData>) => {
      logger.info(`[Worker] Processing job ${job.id} (attempt ${job.attemptsMade + 1})`);
      await _runPipelineAsync(job.data.jobId, job.data.config, job);
    },
    {
      connection: redisConnection,
      concurrency,
    }
  );

  worker.on('completed', (job) => {
    logger.info(`[Worker] Job ${job.id} completed successfully`);
  });

  worker.on('failed', (job, err) => {
    logger.error(`[Worker] Job ${job?.id} failed`, {
      error: err.message,
      attempts: job?.attemptsMade,
    });
  });

  worker.on('error', (err) => {
    logger.error('[Worker] Worker error', { error: err.message });
  });

  logger.info(`🔧 Generation worker started (concurrency: ${concurrency})`);
  return worker;
}
