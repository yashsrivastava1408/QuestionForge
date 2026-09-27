import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { LeetCodeAdapter, GFGAdapter, type IngestedQuestion } from '@question-forge/ingestion';
import { prisma } from '../utils/prisma.js';
import { AppError } from '../middleware/errorHandler.js';

const fetchOneSchema = z.object({
  platform: z.enum(['leetcode', 'gfg']),
  slug: z.string().min(1),
  save: z.boolean().optional().default(false),
});

const fetchCategorySchema = z.object({
  platform: z.literal('leetcode'),
  category: z.string().min(1),
  limit: z.number().int().min(1).max(50).optional().default(20),
  save: z.boolean().optional().default(false),
});

async function persistAsDraft(question: IngestedQuestion, organizationId: string) {
  return prisma.question.create({
    data: {
      title: question.title,
      statement: question.statement,
      type: question.type as any,
      difficulty: question.difficulty as any,
      topic: question.topic,
      tags: question.tags,
      languages: question.languages,
      sourceUrl: question.sourceUrl,
      sourcePlatform: question.sourcePlatform,
      status: 'DRAFT',
      organizationId,
    },
  });
}

/**
 * Ingestion endpoints: pull real problems from public platforms (LeetCode,
 * GeeksforGeeks) into the question bank as `DRAFT` rows, using
 * `@question-forge/ingestion`. This is deliberately separate from the AI
 * generation pipeline (`generationService.ts`) — an ingested question has no
 * optimal/brute-force solution or test cases yet, it's a real-world problem
 * statement staged for a reviewer to complete or regenerate solutions for.
 */
export class IngestionController {
  static async fetchOne(req: Request, res: Response, next: NextFunction) {
    try {
      const { platform, slug, save } = fetchOneSchema.parse(req.body);

      const adapter = platform === 'leetcode' ? new LeetCodeAdapter() : new GFGAdapter();
      const question = await adapter.fetchQuestion(slug);

      if (!question) {
        throw new AppError(`Could not fetch '${slug}' from ${platform}. It may not exist or the source changed its page structure.`, 404);
      }

      if (!save) {
        return res.json({ success: true, saved: false, question });
      }

      const created = await persistAsDraft(question, req.user!.organizationId);
      res.status(201).json({ success: true, saved: true, question: created });
    } catch (err) { next(err); }
  }

  static async fetchByCategory(req: Request, res: Response, next: NextFunction) {
    try {
      const { category, limit, save } = fetchCategorySchema.parse(req.body);

      const adapter = new LeetCodeAdapter();
      const questions = await adapter.fetchByCategory(category, limit);

      if (!save) {
        return res.json({ success: true, saved: false, count: questions.length, questions });
      }

      const created = await Promise.all(
        questions.map((q) => persistAsDraft(q, req.user!.organizationId))
      );
      res.status(201).json({ success: true, saved: true, count: created.length, questions: created });
    } catch (err) { next(err); }
  }
}
