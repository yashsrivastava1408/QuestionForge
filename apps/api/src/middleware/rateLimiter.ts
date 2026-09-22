import rateLimit from 'express-rate-limit';

interface RateLimiterOptions {
  windowMs: number;
  max: number;
  message?: string;
}

export function createRateLimiter(options: RateLimiterOptions) {
  return rateLimit({
    windowMs: options.windowMs,
    max: options.max,
    message: options.message ?? 'Too many requests. Please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
  });
}

// Stricter limiter for the generate endpoint (calls a paid LLM API)
export const generateRateLimiter = rateLimit({
  windowMs: 60_000,       // 1 minute
  max: 5,                 // max 5 generation requests per minute per IP
  message: 'Generation rate limit exceeded. Please wait before generating again.',
  standardHeaders: true,
  legacyHeaders: false,
});
