import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../utils/prisma.js';
import { AppError } from '../middleware/errorHandler.js';
import { enqueueWebhook } from '../queues/webhookQueue.js';
import { createQuestionJob, defaultProvider } from '../services/generationService.js';
import { getLLMClient, type OrgLlmKeys } from '../services/llmService.js';
import { draftKindFor } from '../services/questionDrafts.js';

const solutionMap = z.record(z.string().min(1));

/**
 * Strict allow-list of editable fields (mass-assignment safe: status,
 * organizationId, validationResult etc. can never be set from the request).
 */
export const patchSchema = z.object({
  title: z.string().min(1).optional(),
  statement: z.string().min(1).optional(),
  explanation: z.string().optional(),
  tags: z.array(z.string()).optional(),
  topic: z.string().optional(),
  difficulty: z.enum(['EASY', 'MEDIUM', 'HARD']).optional(),
  options: z.array(z.object({ id: z.string().min(1), text: z.string().min(1) })).min(2).optional(),
  answer: z.string().min(1).optional(),
  optimalSolution: solutionMap.optional(),
  bruteForceSolution: solutionMap.optional(),
  testCases: z.array(z.object({
    input: z.string(),
    expectedOutput: z.string(),
    label: z.string().optional(),
    isSample: z.boolean().optional(),
    isEdgeCase: z.boolean().optional(),
  })).min(1).optional(),
  editNote: z.string().optional(),
}).strict();

/**
 * Editing any of these changes what "correct" means for the question, so the
 * previous validation no longer applies and it must be validated again.
 */
const CONTENT_FIELDS = ['statement', 'difficulty', 'options', 'answer', 'optimalSolution', 'bruteForceSolution', 'testCases'] as const;

export const bulkReviewSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(100),
  decision: z.enum(['APPROVED', 'REJECTED']),
  note: z.string().max(2000).optional(),
});

export const completeSchema = z.object({
  llmProvider: z.enum(['anthropic', 'openai', 'gemini']).optional(),
  languages: z.array(z.enum(['python', 'java', 'cpp', 'javascript'])).min(1).optional(),
});

export const reviewSchema = z.object({
  decision: z.enum(['APPROVED', 'REJECTED']),
  note: z.string().optional(),
});

export class QuestionsController {
  static async list(req: Request, res: Response, next: NextFunction) {
    try {
      const { status, type, difficulty, topic, page = '1', limit = '20' } = req.query;
      const skip = (Number(page) - 1) * Number(limit);

      const where: any = { organizationId: req.user!.organizationId };
      if (status) where.status = status;
      if (type) where.type = type;
      if (difficulty) where.difficulty = difficulty;
      if (topic) where.topic = { contains: topic as string, mode: 'insensitive' };

      const [questions, total] = await Promise.all([
        prisma.question.findMany({
          where,
          skip,
          take: Number(limit),
          orderBy: { createdAt: 'desc' },
          select: {
            id: true, type: true, difficulty: true, topic: true, title: true,
            status: true, version: true, tags: true, sourcePlatform: true,
            validationResult: true, createdAt: true, updatedAt: true,
          },
        }),
        prisma.question.count({ where }),
      ]);

      res.json({ success: true, questions, pagination: { total, page: Number(page), limit: Number(limit) } });
    } catch (err) { next(err); }
  }

  static async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const question = await prisma.question.findFirst({
        where: { id: req.params.id, organizationId: req.user!.organizationId },
        include: { history: { orderBy: { createdAt: 'desc' } }, reviews: true },
      });
      if (!question) throw new AppError('Question not found', 404);

      await prisma.auditLog.create({
        data: {
          organizationId: req.user!.organizationId,
          userId: req.user!.userId,
          action: 'QUESTION_VIEWED',
          entityType: 'Question',
          entityId: question.id,
          ipAddress: req.ip,
        },
      });

      res.json({ success: true, question });
    } catch (err) { next(err); }
  }

  static async patch(req: Request, res: Response, next: NextFunction) {
    try {
      const existing = await prisma.question.findFirst({
        where: { id: req.params.id, organizationId: req.user!.organizationId },
      });
      if (!existing) throw new AppError('Question not found', 404);

      const { editNote, ...allowedData } = patchSchema.parse(req.body);
      if (existing.status === 'VALIDATING') {
        throw new AppError('This question is being validated right now. Try again when it finishes.', 409);
      }

      const contentChanged = CONTENT_FIELDS.some(
        (field) => allowedData[field] !== undefined && JSON.stringify(allowedData[field]) !== JSON.stringify(existing[field])
      );
      // A DRAFT (e.g. a fresh import with no solutions yet) has never been validated; it stays a draft.
      const needsRevalidation = contentChanged && existing.status !== 'DRAFT';

      await prisma.questionHistory.create({
        data: {
          questionId: existing.id,
          version: existing.version,
          snapshot: existing as any,
          editedById: req.user!.userId,
          editNote: editNote,
        },
      });

      const updated = await prisma.question.update({
        where: { id: req.params.id },
        data: {
          ...allowedData,
          version: existing.version + 1,
          updatedAt: new Date(),
          // An edited question loses its VALIDATED/APPROVED standing until it passes again.
          ...(needsRevalidation && { status: 'VALIDATING' as const }),
        },
      });

      const revalidationJobId = needsRevalidation
        ? await createQuestionJob({ kind: 'REVALIDATE', question: updated, requestedBy: req.user!.userId })
        : null;

      await prisma.auditLog.create({
        data: {
          organizationId: req.user!.organizationId,
          userId: req.user!.userId,
          action: 'QUESTION_EDITED',
          entityType: 'Question',
          entityId: existing.id,
          metadata: { fromVersion: existing.version, toVersion: updated.version, revalidationJobId },
          ipAddress: req.ip,
        },
      });

      res.json({ success: true, question: updated, revalidationJobId });
    } catch (err) { next(err); }
  }

  /** POST /:id/revalidate — run validation again on the question as it stands. */
  static async revalidate(req: Request, res: Response, next: NextFunction) {
    try {
      const question = await prisma.question.findFirst({
        where: { id: req.params.id, organizationId: req.user!.organizationId },
      });
      if (!question) throw new AppError('Question not found', 404);
      if (question.status === 'VALIDATING') throw new AppError('This question is already being validated.', 409);
      if (question.status === 'DRAFT' && draftKindFor(question.type) === 'code' && !question.optimalSolution) {
        throw new AppError('This draft has no solutions yet. Use "complete" to generate them first.', 400);
      }

      await prisma.question.update({ where: { id: question.id }, data: { status: 'VALIDATING' } });
      const jobId = await createQuestionJob({ kind: 'REVALIDATE', question, requestedBy: req.user!.userId });

      await prisma.auditLog.create({
        data: {
          organizationId: req.user!.organizationId,
          userId: req.user!.userId,
          action: 'QUESTION_REVALIDATED',
          entityType: 'Question',
          entityId: question.id,
          metadata: { jobId },
          ipAddress: req.ip,
        },
      });

      res.status(202).json({ success: true, jobId, statusUrl: `/api/generate/status/${jobId}` });
    } catch (err) { next(err); }
  }

  /**
   * POST /:id/complete — for an imported DRAFT: have the LLM write solutions, an
   * input generator and tests for the existing statement, then validate them in
   * the sandbox. On success the draft becomes VALIDATED; on failure it stays a DRAFT.
   */
  static async complete(req: Request, res: Response, next: NextFunction) {
    try {
      const { llmProvider, languages } = completeSchema.parse(req.body ?? {});
      const question = await prisma.question.findFirst({
        where: { id: req.params.id, organizationId: req.user!.organizationId },
      });
      if (!question) throw new AppError('Question not found', 404);
      if (question.status !== 'DRAFT') throw new AppError('Only DRAFT questions can be completed.', 400);
      if (draftKindFor(question.type) !== 'code') {
        throw new AppError('Only coding (DSA) drafts can be completed automatically.', 400);
      }
      const running = await prisma.generationItem.findFirst({
        where: { questionId: question.id, status: { in: ['QUEUED', 'GENERATING', 'VALIDATING'] } },
        select: { batchId: true },
      });
      if (running) throw new AppError('This draft is already being completed.', 409);

      // Resolve the provider now so a missing API key is a clear 400 here, not a failed background job.
      const org = await prisma.organization.findUnique({
        where: { id: req.user!.organizationId },
        select: { llmApiKeysEncrypted: true },
      });
      const orgKeys = (org?.llmApiKeysEncrypted ?? null) as OrgLlmKeys;
      const provider = llmProvider ?? defaultProvider(orgKeys);
      getLLMClient(provider, orgKeys);

      const jobId = await createQuestionJob({
        kind: 'COMPLETE_IMPORT',
        question,
        requestedBy: req.user!.userId,
        llmProvider: provider,
        languages,
      });

      await prisma.auditLog.create({
        data: {
          organizationId: req.user!.organizationId,
          userId: req.user!.userId,
          action: 'QUESTION_GENERATED',
          entityType: 'Question',
          entityId: question.id,
          metadata: { jobId, kind: 'COMPLETE_IMPORT' },
          ipAddress: req.ip,
        },
      });

      res.status(202).json({ success: true, jobId, statusUrl: `/api/generate/status/${jobId}` });
    } catch (err) { next(err); }
  }

  static async review(req: Request, res: Response, next: NextFunction) {
    try {
      const { decision, note } = reviewSchema.parse(req.body);

      const question = await prisma.question.findFirst({
        where: { id: req.params.id, organizationId: req.user!.organizationId },
      });
      if (!question) throw new AppError('Question not found', 404);
      if (question.status !== 'VALIDATED' && question.status !== 'IN_REVIEW') {
        throw new AppError('Question must be validated before review', 400);
      }

      await prisma.$transaction([
        prisma.questionReview.create({
          data: { questionId: question.id, reviewerId: req.user!.userId, decision, note },
        }),
        prisma.question.update({
          where: { id: question.id },
          data: { status: decision },
        }),
        prisma.auditLog.create({
          data: {
            organizationId: req.user!.organizationId,
            userId: req.user!.userId,
            action: decision === 'APPROVED' ? 'QUESTION_APPROVED' : 'QUESTION_REJECTED',
            entityType: 'Question',
            entityId: question.id,
            metadata: { note },
            ipAddress: req.ip,
          },
        }),
      ]);

      await enqueueWebhook(req.user!.organizationId, {
        event: decision === 'APPROVED' ? 'question.approved' : 'question.rejected',
        timestamp: new Date().toISOString(),
        organizationId: req.user!.organizationId,
        data: {
          questionId: question.id,
          decision,
          reviewerId: req.user!.userId,
          note,
        },
      });

      res.json({ success: true, message: `Question ${decision.toLowerCase()} successfully` });
    } catch (err) { next(err); }
  }

  /**
   * POST /api/questions/review-bulk — approve or reject several questions at once.
   * Only questions that are VALIDATED (or IN_REVIEW) in the caller's organization
   * are touched; anything else is reported back as skipped, never forced.
   */
  static async reviewBulk(req: Request, res: Response, next: NextFunction) {
    try {
      const { ids, decision, note } = bulkReviewSchema.parse(req.body);
      const organizationId = req.user!.organizationId;

      const eligible = await prisma.question.findMany({
        where: { id: { in: ids }, organizationId, status: { in: ['VALIDATED', 'IN_REVIEW'] } },
        select: { id: true },
      });
      const eligibleIds = eligible.map((q) => q.id);

      if (eligibleIds.length > 0) {
        await prisma.$transaction([
          prisma.questionReview.createMany({
            data: eligibleIds.map((questionId) => ({ questionId, reviewerId: req.user!.userId, decision, note })),
          }),
          prisma.question.updateMany({ where: { id: { in: eligibleIds } }, data: { status: decision } }),
          prisma.auditLog.createMany({
            data: eligibleIds.map((entityId) => ({
              organizationId,
              userId: req.user!.userId,
              action: decision === 'APPROVED' ? ('QUESTION_APPROVED' as const) : ('QUESTION_REJECTED' as const),
              entityType: 'Question',
              entityId,
              metadata: { note, bulk: true },
              ipAddress: req.ip,
            })),
          }),
        ]);
        await Promise.all(
          eligibleIds.map((questionId) =>
            enqueueWebhook(organizationId, {
              event: decision === 'APPROVED' ? 'question.approved' : 'question.rejected',
              timestamp: new Date().toISOString(),
              organizationId,
              data: { questionId, decision, reviewerId: req.user!.userId, note },
            })
          )
        );
      }

      const done = new Set(eligibleIds);
      res.json({ success: true, updated: eligibleIds.length, skipped: ids.filter((id) => !done.has(id)) });
    } catch (err) { next(err); }
  }
}
