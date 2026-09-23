import { Redis } from 'ioredis';
import { logger } from './logger.js';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';

/**
 * Singleton Redis connection used by BullMQ workers, rate limiters, and caches.
 * BullMQ requires maxRetriesPerRequest: null for blocking commands.
 */
export const redisConnection = new Redis(REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  lazyConnect: true,
});

redisConnection.on('connect', () => logger.info('✅ Redis connected'));
redisConnection.on('error', (err: Error) => logger.error('❌ Redis error', { error: err.message }));

/**
 * A second connection for standard commands (rate limiter, caching).
 * maxRetriesPerRequest is left at default (3) so it fails fast on errors.
 */
export const redisClient = new Redis(REDIS_URL, {
  enableReadyCheck: false,
  lazyConnect: true,
});

export async function connectRedis(): Promise<void> {
  await Promise.all([
    redisConnection.connect().catch(() => {}),
    redisClient.connect().catch(() => {}),
  ]);
}
