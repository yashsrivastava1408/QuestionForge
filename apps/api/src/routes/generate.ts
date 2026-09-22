import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../utils/prisma.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { generateRateLimiter } from '../middleware/rateLimiter.js';
import { AppError } from '../middleware/errorHandler.js';
import { runGenerationPipeline } from '../services/generationService.js';

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
  questionTypes: z.array(z.enum(['DSA', 'OOPS', 'SYSTEM_DESIGN', 'SQL', 'CONCEPTUAL'])).min(1),
  languages: z.array(z.string()).default(['python', 'java', 'cpp', 'javascript']),
  companyStyle: z.string().optional(),
  llmProvider: z.enum(['anthropic', 'openai', 'gemini']).default('anthropic'),
  paperId: z.string().optional(),
});

// POST /api/generate — Start generation job
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

      // Start async pipeline
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
        message: `Generation job started. Generating ${config.totalQuestions} questions.`,
      });
    } catch (err) { next(err); }
  }
);

// GET /api/generate/status/:jobId — Poll job status
generateRouter.get('/status/:jobId', authenticate, async (req, res, next) => {
  try {
    // In production: fetch from a job queue (e.g. BullMQ). For now, derive from DB.
    const questions = await prisma.question.findMany({
      where: {
        organizationId: req.user!.organizationId,
        // jobId tracking would be added to the Question model in production
      },
      select: { status: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    res.json({ success: true, jobId: req.params.jobId, questions: questions.length });
  } catch (err) { next(err); }
});
