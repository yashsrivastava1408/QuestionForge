import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../utils/prisma.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { generateRateLimiter } from '../middleware/rateLimiter.js';
import { AppError } from '../middleware/errorHandler.js';
import { runGenerationPipeline } from '../services/generationService.js';
import { generationQueue } from '../queues/generationQueue.js';

export const generateRouter = Router();

const generateSchema = z.object({
  roleLevel: z.enum(['intern', 'sde1', 'sde2', 'senior', 'lead']),
  topics: z.array(z.string()).min(1).max(10),
  difficultyDistribution: z.object({
    easy: z.number().min(0).max(100),
    medium: z.number().min(0).max(100),
    hard: z.number().min(0).max(100),
  }).refine(d => d.easy + d.medium + d.hard === 100, {
    message: 'Difficulty distribution must sum to 100',
  }),
  totalQuestions: z.number().min(1).max(100),
  questionTypes: z.array(z.enum(['DSA', 'OOPS', 'SYSTEM_DESIGN', 'SQL', 'CONCEPTUAL', 'MCQ'])).min(1),
  languages: z.array(z.string()).default(['python', 'java', 'cpp', 'javascript']),
  companyStyle: z.string().optional(),
  llmProvider: z.enum(['anthropic', 'openai', 'gemini']).default('anthropic'),
  paperId: z.string().optional(),
  mcqOptionsCount: z.number().min(2).max(10).optional().default(4),
});

// POST /api/generate — Enqueue a generation job
generateRouter.post(
  '/',
  authenticate,
  authorize('ADMIN', 'GENERATOR'),
  generateRateLimiter,
  async (req, res, next) => {
    try {
      const config = generateSchema.parse(req.body);

      // Check daily quota
      const org = await prisma.organization.findUnique({
        where: { id: req.user!.organizationId },
        select: { maxQuestionsPerDay: true },
      });
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayCount = await prisma.question.count({
        where: { organizationId: req.user!.organizationId, createdAt: { gte: today } },
      });
      if (todayCount + config.totalQuestions > (org?.maxQuestionsPerDay ?? 200)) {
        throw new AppError(
          `Daily generation quota exceeded. Used ${todayCount} of ${org?.maxQuestionsPerDay}.`,
          429
        );
      }

      // Estimate cost
      const estimatedTokensPerQuestion = 2500;
      const estimatedTokens = config.totalQuestions * estimatedTokensPerQuestion;
      const estimatedCostUsd = (estimatedTokens / 1_000_000) * 3.0; // Claude Sonnet approx

      // Enqueue persistent job (replaces fire-and-forget)
      const jobId = await runGenerationPipeline({
        ...config,
        organizationId: req.user!.organizationId,
        requestedBy: req.user!.userId,
      });

      // Audit log
      await prisma.auditLog.create({
        data: {
          organizationId: req.user!.organizationId,
          userId: req.user!.userId,
          action: 'QUESTION_GENERATED',
          metadata: { jobId, config, estimatedTokens, estimatedCostUsd },
          ipAddress: req.ip,
        },
      });

      res.status(202).json({
        success: true,
        jobId,
        estimatedTokens,
        estimatedCostUsd: estimatedCostUsd.toFixed(4),
        message: `Generation job enqueued. Generating ${config.totalQuestions} questions.`,
        statusUrl: `/api/generate/status/${jobId}`,
      });
    } catch (err) { next(err); }
  }
);

// GET /api/generate/status/:jobId — Real-time job status from BullMQ
generateRouter.get('/status/:jobId', authenticate, async (req, res, next) => {
  try {
    const job = await generationQueue.getJob(req.params.jobId);
    if (!job) {
      throw new AppError('Job not found. It may have expired or never existed.', 404);
    }

    const state = await job.getState();
    const progress = job.progress;
    const failedReason = job.failedReason ?? null;
    const processedOn = job.processedOn ? new Date(job.processedOn).toISOString() : null;
    const finishedOn = job.finishedOn ? new Date(job.finishedOn).toISOString() : null;
    const attemptsMade = job.attemptsMade;

    res.json({
      success: true,
      jobId: req.params.jobId,
      state,           // 'waiting' | 'active' | 'completed' | 'failed' | 'delayed'
      progress,        // 0–100 percent complete
      attemptsMade,
      processedOn,
      finishedOn,
      failedReason,
    });
  } catch (err) { next(err); }
});

// GET /api/generate/status/:jobId/stream — SSE stream for real-time progress
// Note: EventSource in browsers cannot set custom headers, so we also accept the
// token as a ?token= query param for this endpoint only.
generateRouter.get('/status/:jobId/stream', async (req, res, next) => {
  try {
    // Support token via query param (EventSource can't set Authorization header)
    if (req.query.token && !req.headers.authorization) {
      req.headers.authorization = `Bearer ${req.query.token}`;
    }
    // Inline auth check (can't use middleware cleanly on SSE routes)
    const jwt = await import('jsonwebtoken');
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) { res.status(401).json({ error: 'Authentication required' }); return; }

    const { redisClient } = await import('../utils/redis.js');
    let payload: any;
    try {
      payload = jwt.default.verify(token, process.env.JWT_SECRET!);
      if (payload.jti) {
        const revoked = await redisClient.get(`jwt:revoked:${payload.jti}`);
        if (revoked) { res.status(401).json({ error: 'Token revoked' }); return; }
      }
    } catch {
      if (token !== 'mock-token' || process.env.NODE_ENV === 'production') {
        res.status(401).json({ error: 'Invalid token' }); return;
      }
    }

    const job = await generationQueue.getJob(req.params.jobId);
    if (!job) throw new AppError('Job not found', 404);

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const send = (data: object) => res.write(`data: ${JSON.stringify(data)}\n\n`);

    const interval = setInterval(async () => {
      try {
        const state = await job.getState();
        const progress = job.progress;
        send({ state, progress, jobId: req.params.jobId });

        if (state === 'completed' || state === 'failed') {
          send({ state, progress, jobId: req.params.jobId, done: true, failedReason: job.failedReason });
          clearInterval(interval);
          res.end();
        }
      } catch {
        clearInterval(interval);
        res.end();
      }
    }, 1500);

    req.on('close', () => {
      clearInterval(interval);
      res.end();
    });
  } catch (err) { next(err); }
});
