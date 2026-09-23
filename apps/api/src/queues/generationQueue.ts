import { Queue } from 'bullmq';
import { redisConnection } from '../utils/redis.js';
import type { GenerationWizardConfig } from '@question-forge/shared';

export interface GenerationJobData {
  jobId: string;
  config: GenerationWizardConfig;
}

/**
 * BullMQ Queue for generation jobs.
 * Jobs are persisted in Redis — surviving server restarts and crashes.
 * Replaces the previous fire-and-forget _runPipelineAsync pattern.
 */
export const generationQueue = new Queue<GenerationJobData>('generation', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000, // 5s, 10s, 20s
    },
    removeOnComplete: {
      age: 24 * 3600, // keep completed jobs for 24h for status polling
      count: 500,
    },
    removeOnFail: {
      age: 7 * 24 * 3600, // keep failed jobs for 7 days for debugging
    },
  },
});
