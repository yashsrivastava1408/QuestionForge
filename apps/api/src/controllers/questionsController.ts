import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../utils/prisma.js';
import { AppError } from '../middleware/errorHandler.js';
import { enqueueWebhook } from '../queues/webhookQueue.js';

export const patchSchema = z.object({
  title: z.string().min(1).optional(),
  statement: z.string().min(1).optional(),
  explanation: z.string().optional(),
  tags: z.array(z.string()).optional(),
  topic: z.string().optional(),
  editNote: z.string().optional(),
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
        data: { ...allowedData, version: existing.version + 1, updatedAt: new Date() },
      });

      await prisma.auditLog.create({
        data: {
          organizationId: req.user!.organizationId,
          userId: req.user!.userId,
          action: 'QUESTION_EDITED',
          entityType: 'Question',
          entityId: existing.id,
          metadata: { fromVersion: existing.version, toVersion: updated.version },
          ipAddress: req.ip,
        },
      });

      res.json({ success: true, question: updated });
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
}
