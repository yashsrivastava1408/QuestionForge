import rateLimit from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import { redisClient } from '../utils/redis.js';

interface RateLimiterOptions {
  windowMs: number;
  max: number;
  message?: string;
  keyPrefix?: string;
}

/**
 * Creates a rate limiter backed by Redis.
 * Works correctly across multiple API replicas because all instances
 * share the same Redis counter — unlike the old in-memory store.
 * Falls back to in-memory if Redis is unavailable.
 */
export function createRateLimiter(options: RateLimiterOptions) {
  return rateLimit({
    windowMs: options.windowMs,
    limit: options.max,
    message: options.message ?? 'Too many requests. Please try again later.',
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    store: new RedisStore({
      prefix: options.keyPrefix ?? 'rl:global:',
      sendCommand: (...args: string[]) => (redisClient as any).call(...args),
    }),
  });
}

/**
 * Stricter rate limiter for the generate endpoint.
 * 5 generation requests per minute per user — protects LLM API spend.
 */
export const generateRateLimiter = rateLimit({
  windowMs: 60_000,
  limit: 5,
  message: 'Generation rate limit exceeded. Please wait before generating again.',
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  store: new RedisStore({
    prefix: 'rl:generate:',
    sendCommand: (...args: string[]) => (redisClient as any).call(...args),
  }),
});
