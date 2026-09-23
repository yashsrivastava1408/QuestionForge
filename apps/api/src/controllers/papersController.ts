import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../utils/prisma.js';
import { AppError } from '../middleware/errorHandler.js';

export const createPaperSchema = z.object({
  title: z.string().min(1),
  questionIds: z.array(z.string()).min(1),
  config: z.record(z.unknown()).optional(),
});

export class PapersController {
  static async create(req: Request, res: Response, next: NextFunction) {
    try {
      const { title, questionIds, config } = createPaperSchema.parse(req.body);

      // Prevent IDOR: Ensure all referenced questions belong to the user's organization
      const accessibleQuestionsCount = await prisma.question.count({
        where: {
          id: { in: questionIds },
          organizationId: req.user!.organizationId,
        },
      });

      if (accessibleQuestionsCount !== questionIds.length) {
        throw new AppError('One or more questions do not exist or belong to another organization', 400);
      }

      const paper = await prisma.paper.create({
        data: {
          title,
          organizationId: req.user!.organizationId,
          config: (config as any) ?? {},
          questions: {
            create: questionIds.map((qId, idx) => ({ questionId: qId, order: idx + 1 })),
          },
        },
        include: {
          questions: {
            include: { question: { select: { id: true, title: true, difficulty: true, type: true } } },
          },
        },
      });

      res.status(201).json({ success: true, paper });
    } catch (err) { next(err); }
  }

  static async list(req: Request, res: Response, next: NextFunction) {
    try {
      const papers = await prisma.paper.findMany({
        where: { organizationId: req.user!.organizationId },
        include: { _count: { select: { questions: true } }, exports: { select: { format: true, createdAt: true } } },
        orderBy: { createdAt: 'desc' },
      });
      res.json({ success: true, papers });
    } catch (err) { next(err); }
  }

  static async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const paper = await prisma.paper.findFirst({
        where: { id: req.params.id, organizationId: req.user!.organizationId },
        include: { questions: { include: { question: true }, orderBy: { order: 'asc' } }, exports: true },
      });
      if (!paper) throw new AppError('Paper not found', 404);
      res.json({ success: true, paper });
    } catch (err) { next(err); }
  }
}
