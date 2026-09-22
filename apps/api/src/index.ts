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

const app = express();
const PORT = process.env.PORT || 4000;

// ---- Security Middleware ----
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));

// ---- Body Parsing ----
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ---- Logging ----
app.use(requestLogger);

// ---- Global Rate Limiter ----
app.use(createRateLimiter({
  windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS) || 900_000,
  max: Number(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
}));

// ---- Health Check ----
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), version: '1.0.0' });
});

// ---- API Routes ----
app.use('/api/auth', authRouter);
app.use('/api/questions', questionsRouter);
app.use('/api/generate', generateRouter);
app.use('/api/papers', papersRouter);
app.use('/api/export', exportRouter);
app.use('/api/analytics', analyticsRouter);
app.use('/api/webhooks', webhooksRouter);
app.use('/api/admin', adminRouter);

// ---- Error Handler (must be last) ----
app.use(errorHandler);

app.listen(PORT, () => {
  logger.info(`🚀 Question Forge API running on http://localhost:${PORT}`);
});

export default app;
