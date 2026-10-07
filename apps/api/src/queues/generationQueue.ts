import { Queue } from 'bullmq';
import { redisConnection } from '../utils/redis.js';

export interface GenerationJobData {
  /** GenerationItem.id — one BullMQ job per question slot. */
  itemId: string;
}

export const GENERATION_JOB_ATTEMPTS = 3;

/**
 * BullMQ queue for generation work. Each job is ONE question, so:
 *  - a crash or retry repeats one question, never a whole batch;
 *  - questions in a batch run in parallel up to WORKER_CONCURRENCY;
 *  - progress is real (items finished / items total), not an estimate.
 *
 * A job only throws for infrastructure problems (LLM provider down, sandbox
 * unreachable). A question that fails validation is a normal, completed job.
 */
export const generationQueue = new Queue<GenerationJobData>('generation', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: GENERATION_JOB_ATTEMPTS,
    backoff: {
      type: 'exponential',
      delay: Number(process.env.GENERATION_RETRY_DELAY_MS ?? 5000), // 5s, 10s
    },
    removeOnComplete: { age: 24 * 3600, count: 2000 },
    removeOnFail: { age: 7 * 24 * 3600 },
  },
});
