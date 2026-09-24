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

/**
 * Checks whether a JWT's JTI has been revoked in Redis.
 */
export async function isTokenBlacklisted(jti: string): Promise<boolean> {
  try {
    const isRevoked = await redisClient.get(`jwt:revoked:${jti}`);
    return isRevoked === '1';
  } catch (err: any) {
    logger.warn('[Redis] Error checking token blacklist', { error: err.message });
    return false;
  }
}

/**
 * Adds a JWT's JTI to the revocation blacklist with a matching TTL.
 */
export async function blacklistToken(jti: string, ttlSeconds: number): Promise<void> {
  try {
    if (ttlSeconds > 0) {
      await redisClient.set(`jwt:revoked:${jti}`, '1', 'EX', ttlSeconds);
    }
  } catch (err: any) {
    logger.error('[Redis] Error adding token to blacklist', { error: err.message });
  }
}

