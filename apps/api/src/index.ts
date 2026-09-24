import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { createRateLimiter } from './middleware/rateLimiter.js';
import { errorHandler } from './middleware/errorHandler.js';
import { requestLogger } from './middleware/requestLogger.js';
import { authRouter } from './routes/auth.js';
import { questionsRouter } from './routes/questions.js';
import { generateRouter } from './routes/generate.js';
import { papersRouter } from './routes/papers.js';
import { exportRouter } from './routes/export.js';
import { analyticsRouter } from './routes/analytics.js';
import { webhooksRouter } from './routes/webhooks.js';
import { adminRouter } from './routes/admin.js';
import { logger } from './utils/logger.js';
import { prisma } from './utils/prisma.js';
import { connectRedis, redisClient } from './utils/redis.js';
import { startGenerationWorker } from './queues/generationWorker.js';
import { startWebhookWorker } from './queues/webhookQueue.js';
import { setupBullBoard, bullBoardAuthMiddleware } from './admin/bullBoard.js';

const app = express();
const PORT = process.env.PORT || 4000;

// ---- Security Middleware ----
app.use(helmet({ contentSecurityPolicy: false }));

/**
 * Dynamic CORS allowlist — supports multi-tenant SaaS, mobile apps, and
 * customer-embedded widgets by allowing multiple origins via CORS_ORIGINS env.
 * Example: CORS_ORIGINS=https://app.qforge.io,https://admin.qforge.io
 */
const allowedOrigins = (process.env.CORS_ORIGINS ?? process.env.FRONTEND_URL ?? 'http://localhost:5173')
  .split(',')
  .map((o) => o.trim());

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow non-browser requests (e.g. server-to-server, curl)
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`CORS: origin ${origin} not allowed`));
      }
    },
    credentials: true,
  })
);

// ---- Body Parsing ----
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ---- Logging ----
app.use(requestLogger);

// ---- Health & Readiness Probes (mounted before rate limiting) ----
const livenessHandler = (_req: express.Request, res: express.Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), version: '1.0.0' });
};

const readinessHandler = async (_req: express.Request, res: express.Response) => {
  let dbHealthy = false;
  let redisHealthy = false;

  try {
    await prisma.$queryRaw`SELECT 1`;
    dbHealthy = true;
  } catch (err: any) {
    logger.error('[Health] DB ping failed', { error: err.message });
  }

  try {
    const pong = await redisClient.ping();
    redisHealthy = pong === 'PONG';
  } catch (err: any) {
    logger.error('[Health] Redis ping failed', { error: err.message });
  }

  const isReady = dbHealthy && redisHealthy;
  const status = isReady ? 'ready' : 'degraded';

  res.status(isReady ? 200 : 503).json({
    status,
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    services: {
      database: dbHealthy ? 'healthy' : 'unreachable',
      redis: redisHealthy ? 'healthy' : 'unreachable',
    },
  });
};

app.get('/health', livenessHandler);
app.get('/api/health', livenessHandler);
app.get('/health/ready', readinessHandler);
app.get('/api/health/ready', readinessHandler);

// ---- Global Rate Limiter (Redis-backed, works across replicas) ----
app.use(createRateLimiter({
  windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS) || 900_000,
  max: Number(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
}));

// ---- API Routes ----
app.use('/api/auth', authRouter);
app.use('/api/questions', questionsRouter);
app.use('/api/generate', generateRouter);
app.use('/api/papers', papersRouter);
app.use('/api/export', exportRouter);
app.use('/api/analytics', analyticsRouter);
app.use('/api/webhooks', webhooksRouter);
app.use('/api/admin', adminRouter);

// ---- Bull Board Interactive Queue Dashboard (Admin Only) ----
const bullBoardAdapter = setupBullBoard();
app.use('/admin/queues', bullBoardAuthMiddleware, bullBoardAdapter.getRouter());

// ---- Error Handler (must be last) ----
app.use(errorHandler);

// ---- Bootstrap ----
async function bootstrap() {
  // Connect Redis before starting so the queue and rate limiter are ready
  await connectRedis();

  // Dual-mode worker support:
  // - In development: runs embedded workers by default for single-terminal convenience.
  // - In production: set ENABLE_EMBEDDED_WORKERS=false to run pure stateless HTTP,
  //   while the dedicated worker container runs apps/api/src/worker.ts.
  const shouldRunEmbeddedWorkers =
    process.env.ENABLE_EMBEDDED_WORKERS === 'true' ||
    (process.env.NODE_ENV !== 'production' && process.env.ENABLE_EMBEDDED_WORKERS !== 'false');

  let worker: ReturnType<typeof startGenerationWorker> | null = null;
  let webhookWorker: ReturnType<typeof startWebhookWorker> | null = null;

  if (shouldRunEmbeddedWorkers) {
    logger.info('[API] Booting embedded BullMQ queue workers...');
    worker = startGenerationWorker();
    webhookWorker = startWebhookWorker();
  } else {
    logger.info('[API] Running in stateless HTTP-only mode (worker process decoupled).');
  }

  const server = app.listen(PORT, () => {
    logger.info(`🚀 Question Forge API running on http://localhost:${PORT}`);
  });

  /**
   * Graceful shutdown — handle SIGTERM (Docker stop) and SIGINT (Ctrl+C).
   * 1. Stop accepting new HTTP requests
   * 2. Let embedded BullMQ workers drain if active
   * 3. Disconnect from DB and Redis
   */
  const shutdown = async (signal: string) => {
    logger.info(`[Shutdown] Received ${signal}. Gracefully shutting down...`);

    server.close(async () => {
      logger.info('[Shutdown] HTTP server closed. Cleaning up...');
      if (worker && webhookWorker) {
        logger.info('[Shutdown] Draining embedded workers...');
        await Promise.all([worker.close(), webhookWorker.close()]);
      }
      await prisma.$disconnect();
      logger.info('[Shutdown] All connections closed. Exiting.');
      process.exit(0);
    });

    // Force exit after 30s if graceful shutdown hangs
    setTimeout(() => {
      logger.error('[Shutdown] Graceful shutdown timed out. Force exiting.');
      process.exit(1);
    }, 30_000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

bootstrap().catch((err) => {
  logger.error('Failed to bootstrap application', { error: err.message });
  process.exit(1);
});

export default app;
