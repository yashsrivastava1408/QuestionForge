import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../utils/prisma.js';
import { AppError } from '../middleware/errorHandler.js';

export const createPaperSchema = z.object({
  title: z.string().min(1),
  questionIds: z.array(z.string()).min(1),
  config: z.record(z.unknown()).optional(),
});

const blueprintRow = z.object({
  type: z.enum(['DSA', 'OOPS', 'SYSTEM_DESIGN', 'SQL', 'CONCEPTUAL', 'MCQ']).optional(),
  difficulty: z.enum(['EASY', 'MEDIUM', 'HARD']).optional(),
  topic: z.string().min(1).optional(),
  count: z.number().int().min(1).max(100),
});

export const assembleSchema = z.object({
  title: z.string().min(1),
  blueprint: z.array(blueprintRow).min(1).max(20),
});

export const updatePaperSchema = z.object({
  title: z.string().min(1).optional(),
  /** The complete, ordered list of questions the paper should contain afterwards. */
  questionIds: z.array(z.string()).min(1).max(200).optional(),
}).strict();

/** Fisher–Yates; a paper should not always pick the same "first N" questions. */
function shuffle<T>(items: T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export class PapersController {
  /** GET /api/papers/availability — how many APPROVED questions exist per type and difficulty. */
  static async availability(req: Request, res: Response, next: NextFunction) {
    try {
      const groups = await prisma.question.groupBy({
        by: ['type', 'difficulty'],
        where: { organizationId: req.user!.organizationId, status: 'APPROVED' },
        _count: true,
      });
      res.json({
        success: true,
        available: groups.map((g) => ({ type: g.type, difficulty: g.difficulty, count: g._count })),
      });
    } catch (err) { next(err); }
  }

  /**
   * POST /api/papers/assemble — build a paper from a blueprint such as
   * "2 EASY DSA, 1 SQL, 5 MCQ". Questions are drawn at random from the APPROVED
   * bank, never twice. If the bank cannot fill a row the request fails and says
   * which rows are short, rather than quietly producing a smaller paper.
   */
  static async assemble(req: Request, res: Response, next: NextFunction) {
    try {
      const { title, blueprint } = assembleSchema.parse(req.body);
      const organizationId = req.user!.organizationId;

      const picked: string[] = [];
      const shortages: string[] = [];
      for (const row of blueprint) {
        const candidates = await prisma.question.findMany({
          where: {
            organizationId,
            status: 'APPROVED',
            id: { notIn: picked },
            ...(row.type && { type: row.type }),
            ...(row.difficulty && { difficulty: row.difficulty }),
            ...(row.topic && { topic: { contains: row.topic, mode: 'insensitive' as const } }),
          },
          select: { id: true },
        });
        const label = [row.difficulty, row.type, row.topic && `"${row.topic}"`].filter(Boolean).join(' ') || 'any';
        if (candidates.length < row.count) {
          shortages.push(`${label}: need ${row.count}, only ${candidates.length} approved`);
          continue;
        }
        picked.push(...shuffle(candidates).slice(0, row.count).map((c) => c.id));
      }

      if (shortages.length > 0) {
        throw new AppError(`Not enough approved questions — ${shortages.join('; ')}.`, 400);
      }

      const paper = await prisma.paper.create({
        data: {
          title,
          organizationId,
          config: { blueprint },
          questions: { create: picked.map((questionId, idx) => ({ questionId, order: idx + 1 })) },
        },
        include: { _count: { select: { questions: true } } },
      });
      res.status(201).json({ success: true, paper });
    } catch (err) { next(err); }
  }

  /** PATCH /api/papers/:id — rename a paper and/or replace its ordered question list. */
  static async update(req: Request, res: Response, next: NextFunction) {
    try {
      const { title, questionIds } = updatePaperSchema.parse(req.body);
      const organizationId = req.user!.organizationId;

      const paper = await prisma.paper.findFirst({ where: { id: req.params.id, organizationId }, select: { id: true } });
      if (!paper) throw new AppError('Paper not found', 404);

      if (questionIds) {
        if (new Set(questionIds).size !== questionIds.length) {
          throw new AppError('A question can appear in a paper only once', 400);
        }
        const owned = await prisma.question.count({ where: { id: { in: questionIds }, organizationId } });
        if (owned !== questionIds.length) {
          throw new AppError('One or more questions do not exist or belong to another organization', 400);
        }
      }

      await prisma.$transaction([
        ...(title ? [prisma.paper.update({ where: { id: paper.id }, data: { title } })] : []),
        ...(questionIds
          ? [
              prisma.paperQuestion.deleteMany({ where: { paperId: paper.id } }),
              prisma.paperQuestion.createMany({
                data: questionIds.map((questionId, idx) => ({ paperId: paper.id, questionId, order: idx + 1 })),
              }),
            ]
          : []),
      ]);

      const updated = await prisma.paper.findUnique({
        where: { id: paper.id },
        include: {
          questions: {
            orderBy: { order: 'asc' },
            include: { question: { select: { id: true, title: true, type: true, difficulty: true, status: true } } },
          },
        },
      });
      res.json({ success: true, paper: updated });
    } catch (err) { next(err); }
  }

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
