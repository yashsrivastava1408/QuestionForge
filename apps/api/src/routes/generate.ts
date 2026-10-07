import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../utils/prisma.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { generateRateLimiter } from '../middleware/rateLimiter.js';
import { AppError } from '../middleware/errorHandler.js';
import { cancelBatch, createGenerationBatch, getBatchStatus, retryFailedItems } from '../services/generationService.js';
import { getLLMClient, type OrgLlmKeys } from '../services/llmService.js';

export const generateRouter = Router();

export const generateSchema = z.object({
  roleLevel: z.enum(['intern', 'sde1', 'sde2', 'senior', 'lead']),
  topics: z.array(z.string().min(1).max(80)).min(1).max(10),
  difficultyDistribution: z.object({
    easy: z.number().min(0).max(100),
    medium: z.number().min(0).max(100),
    hard: z.number().min(0).max(100),
  }).refine(d => d.easy + d.medium + d.hard === 100, {
    message: 'Difficulty distribution must sum to 100',
  }),
  totalQuestions: z.number().int().min(1).max(100),
  questionTypes: z.array(z.enum(['DSA', 'OOPS', 'SYSTEM_DESIGN', 'SQL', 'CONCEPTUAL', 'MCQ'])).min(1),
  languages: z.array(z.enum(['python', 'java', 'cpp', 'javascript'])).min(1).default(['python', 'java', 'cpp', 'javascript']),
  companyStyle: z.string().max(60).optional(),
  llmProvider: z.enum(['anthropic', 'openai', 'gemini']).default('anthropic'),
  paperId: z.string().optional(),
  mcqOptionsCount: z.number().int().min(2).max(10).optional().default(4),
});

/** Start of the current UTC day — the quota window must not depend on the server's timezone. */
function startOfUtcDay(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

// POST /api/generate — Enqueue a generation batch (one job per question)
generateRouter.post(
  '/',
  authenticate,
  authorize('ADMIN', 'GENERATOR'),
  generateRateLimiter,
  async (req, res, next) => {
    try {
      const config = generateSchema.parse(req.body);
      const organizationId = req.user!.organizationId;

      const org = await prisma.organization.findUnique({
        where: { id: organizationId },
        select: { maxQuestionsPerDay: true, llmApiKeysEncrypted: true },
      });
      if (!org) throw new AppError('Organization not found', 404);

      // Fail now, with a clear message, if the chosen provider has no key — not minutes later inside a worker.
      getLLMClient(config.llmProvider, org.llmApiKeysEncrypted as OrgLlmKeys);

      if (config.paperId) {
        const paper = await prisma.paper.findFirst({ where: { id: config.paperId, organizationId }, select: { id: true } });
        if (!paper) throw new AppError('Paper not found', 404);
      }

      // Daily quota counts question slots REQUESTED today (success or not) — that is
      // what costs money. Imports and re-validations do not count.
      const usedToday = await prisma.generationItem.count({
        where: { batch: { organizationId, kind: 'GENERATE' }, createdAt: { gte: startOfUtcDay() } },
      });
      if (usedToday + config.totalQuestions > org.maxQuestionsPerDay) {
        throw new AppError(
          `Daily generation quota exceeded. Used ${usedToday} of ${org.maxQuestionsPerDay} today (resets at 00:00 UTC).`,
          429
        );
      }

      const jobId = await createGenerationBatch({ ...config, organizationId, requestedBy: req.user!.userId });

      await prisma.auditLog.create({
        data: {
          organizationId,
          userId: req.user!.userId,
          action: 'QUESTION_GENERATED',
          entityType: 'GenerationBatch',
          entityId: jobId,
          metadata: { jobId, config },
          ipAddress: req.ip,
        },
      });

      res.status(202).json({
        success: true,
        jobId,
        total: config.totalQuestions,
        message: `Generation started: ${config.totalQuestions} question job(s) enqueued.`,
        statusUrl: `/api/generate/status/${jobId}`,
      });
    } catch (err) { next(err); }
  }
);

// GET /api/generate/jobs — Recent batches for this organization, with outcome counts
generateRouter.get('/jobs', authenticate, async (req, res, next) => {
  try {
    const batches = await prisma.generationBatch.findMany({
      where: { organizationId: req.user!.organizationId },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true, kind: true, total: true, createdAt: true, finishedAt: true, cancelledAt: true,
        inputTokens: true, outputTokens: true, config: true,
      },
    });
    const counts = await prisma.generationItem.groupBy({
      by: ['batchId', 'status'],
      where: { batchId: { in: batches.map((b) => b.id) } },
      _count: true,
    });
    const count = (batchId: string, status: string) =>
      counts.find((c) => c.batchId === batchId && c.status === status)?._count ?? 0;

    res.json({
      success: true,
      jobs: batches.map(({ config, ...b }) => ({
        ...b,
        llmProvider: (config as any)?.llmProvider ?? null,
        questionTypes: (config as any)?.questionTypes ?? null,
        validated: count(b.id, 'VALIDATED'),
        failed: count(b.id, 'FAILED'),
      })),
    });
  } catch (err) { next(err); }
});

// POST /api/generate/jobs/:jobId/cancel — Stop a running batch (validated questions are kept)
generateRouter.post('/jobs/:jobId/cancel', authenticate, authorize('ADMIN', 'GENERATOR'), async (req, res, next) => {
  try {
    const found = await cancelBatch(req.params.jobId, req.user!.organizationId);
    if (!found) throw new AppError('Job not found.', 404);
    res.json({ success: true, message: 'Job cancelled. Questions already validated are kept.' });
  } catch (err) { next(err); }
});

// POST /api/generate/jobs/:jobId/retry-failed — Re-run only the failed questions of a finished batch
generateRouter.post(
  '/jobs/:jobId/retry-failed',
  authenticate,
  authorize('ADMIN', 'GENERATOR'),
  generateRateLimiter,
  async (req, res, next) => {
    try {
      const retried = await retryFailedItems(req.params.jobId, req.user!.organizationId);
      res.status(202).json({ success: true, retried, jobId: req.params.jobId });
    } catch (err) { next(err); }
  }
);

// GET /api/generate/status/:jobId — Per-question status, real token usage
generateRouter.get('/status/:jobId', authenticate, async (req, res, next) => {
  try {
    const status = await getBatchStatus(req.params.jobId, req.user!.organizationId);
    if (!status) throw new AppError('Job not found.', 404);
    res.json({ success: true, ...status });
  } catch (err) { next(err); }
});

// GET /api/generate/status/:jobId/stream — SSE stream of the same status object.
// Authenticated with the normal Authorization header: the frontend reads the
// stream with fetch(), so the token never has to travel in the URL.
generateRouter.get('/status/:jobId/stream', authenticate, async (req, res, next) => {
  try {
    const { jobId } = req.params;
    const organizationId = req.user!.organizationId;

    const first = await getBatchStatus(jobId, organizationId);
    if (!first) throw new AppError('Job not found.', 404);

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // nginx: do not buffer the stream
    res.flushHeaders();

    let closed = false;
    let timer: NodeJS.Timeout | undefined;
    const send = (data: object) => res.write(`data: ${JSON.stringify(data)}\n\n`);
    const stop = () => {
      closed = true;
      if (timer) clearTimeout(timer);
      res.end();
    };

    send(first);
    if (first.done) return stop();

    const tick = async () => {
      if (closed) return;
      try {
        const status = await getBatchStatus(jobId, organizationId);
        if (!status) return stop();
        send(status);
        if (status.done) return stop();
      } catch {
        return stop();
      }
      timer = setTimeout(tick, 1500);
    };
    timer = setTimeout(tick, 1500);

    req.on('close', stop);
  } catch (err) { next(err); }
});
