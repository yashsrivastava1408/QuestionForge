import type { Request, Response, NextFunction } from 'express';
import { prisma } from '../utils/prisma.js';
import { redisClient } from '../utils/redis.js';
import { estimateCostUsd } from '../services/pricing.js';
import { modelFor } from '../services/llmService.js';
import type { LLMProvider } from '@question-forge/shared';

/** Buckets a free-text failure reason so the dashboard can show WHY questions fail. */
export function classifyFailure(reason: string | null): string {
  const r = reason ?? '';
  if (/^Cancelled/i.test(r)) return 'Cancelled';
  if (/Gave up after|Sandbox unavailable|Piston/i.test(r)) return 'Infrastructure (LLM or sandbox unavailable)';
  if (/too similar to an existing question/i.test(r)) return 'Duplicate of an existing question';
  if (/Difficulty check failed/i.test(r)) return 'Not as hard as labelled (no brute-force gap)';
  if (/independent solver/i.test(r)) return 'Independent solver disagreed (ambiguous or wrong)';
  if (/worked example|expected output/i.test(r)) return 'Stated examples do not match execution';
  if (/Differential testing|brute-force solution|optimal solution|input generator|Missing an optimal/i.test(r)) return 'Solutions failed sandbox testing';
  if (/queries|referenceQuery|alternativeQuery/i.test(r)) return 'SQL queries disagreed or failed';
  if (/Reviewer concern|Judge:|rubric/i.test(r)) return 'Rejected by LLM review';
  if (/could not be used|JSON/i.test(r)) return 'Unusable model output';
  return 'Other';
}

export class AnalyticsController {
  /**
   * GET /api/analytics/generation?days=30 — how generation is actually going:
   * pass rate and attempts per question type, measured spend per provider, the
   * reasons questions fail, and what human reviewers reject.
   */
  static async getGeneration(req: Request, res: Response, next: NextFunction) {
    try {
      const organizationId = req.user!.organizationId;
      const days = Math.min(Math.max(Number(req.query.days) || 30, 1), 365);
      const since = new Date(Date.now() - days * 24 * 3600 * 1000);

      const [items, batches, reviews] = await Promise.all([
        prisma.generationItem.findMany({
          where: { createdAt: { gte: since }, status: { in: ['VALIDATED', 'FAILED'] }, batch: { organizationId, kind: 'GENERATE' } },
          select: { type: true, status: true, attempts: true, failureReason: true },
        }),
        prisma.generationBatch.findMany({
          where: { organizationId, createdAt: { gte: since } },
          select: { config: true, inputTokens: true, outputTokens: true },
        }),
        prisma.questionReview.groupBy({
          by: ['decision'],
          where: { createdAt: { gte: since }, question: { organizationId } },
          _count: true,
        }),
      ]);

      const byType: Record<string, { total: number; validated: number; failed: number; attempts: number }> = {};
      const failureReasons: Record<string, number> = {};
      for (const item of items) {
        const row = (byType[item.type] ??= { total: 0, validated: 0, failed: 0, attempts: 0 });
        row.total++;
        row.attempts += item.attempts;
        if (item.status === 'VALIDATED') row.validated++;
        else {
          row.failed++;
          const bucket = classifyFailure(item.failureReason);
          failureReasons[bucket] = (failureReasons[bucket] ?? 0) + 1;
        }
      }

      const byProvider: Record<string, { inputTokens: number; outputTokens: number; costUsd: number | null }> = {};
      for (const batch of batches) {
        if (batch.inputTokens + batch.outputTokens === 0) continue; // e.g. re-validating code makes no LLM call
        const provider = ((batch.config as any)?.llmProvider ?? 'unknown') as string;
        const row = (byProvider[provider] ??= { inputTokens: 0, outputTokens: 0, costUsd: 0 });
        row.inputTokens += batch.inputTokens;
        row.outputTokens += batch.outputTokens;
      }
      for (const [provider, row] of Object.entries(byProvider)) {
        row.costUsd = provider === 'unknown'
          ? null
          : estimateCostUsd(modelFor(provider as LLMProvider), row.inputTokens, row.outputTokens);
      }

      const validated = items.filter((i) => i.status === 'VALIDATED').length;
      const costs = Object.values(byProvider).map((p) => p.costUsd);
      const totalCost = costs.length > 0 && costs.every((c) => c !== null) ? (costs as number[]).reduce((a, b) => a + b, 0) : null;
      const count = (decision: string) => reviews.find((r) => r.decision === decision)?._count ?? 0;

      res.json({
        success: true,
        days,
        totals: {
          requested: items.length,
          validated,
          failed: items.length - validated,
          passRate: items.length ? Number(((validated / items.length) * 100).toFixed(1)) : null,
          costUsd: totalCost === null ? null : Number(totalCost.toFixed(4)),
          // The number that matters for budgeting: spend divided by questions that actually passed.
          costPerValidatedUsd: totalCost !== null && validated > 0 ? Number((totalCost / validated).toFixed(4)) : null,
        },
        byType: Object.entries(byType).map(([type, r]) => ({
          type,
          total: r.total,
          validated: r.validated,
          failed: r.failed,
          passRate: Number(((r.validated / r.total) * 100).toFixed(1)),
          avgAttempts: Number((r.attempts / r.total).toFixed(2)),
        })),
        byProvider: Object.entries(byProvider).map(([provider, r]) => ({ provider, ...r })),
        failureReasons: Object.entries(failureReasons)
          .map(([reason, n]) => ({ reason, count: n }))
          .sort((a, b) => b.count - a.count),
        humanReview: { approved: count('APPROVED'), rejected: count('REJECTED') },
      });
    } catch (err) { next(err); }
  }

  static async getOverview(req: Request, res: Response, next: NextFunction) {
    try {
      const orgId = req.user!.organizationId;
      const cacheKey = `analytics:overview:${orgId}`;

      const cached = await redisClient.get(cacheKey);
      if (cached) {
        return res.json({ success: true, cached: true, analytics: JSON.parse(cached) });
      }

      const [totalQuestions, byStatus, byType, byDifficulty, byTopic] = await Promise.all([
        prisma.question.count({ where: { organizationId: orgId } }),
        prisma.question.groupBy({ by: ['status'], where: { organizationId: orgId }, _count: true }),
        prisma.question.groupBy({ by: ['type'], where: { organizationId: orgId }, _count: true }),
        prisma.question.groupBy({ by: ['difficulty'], where: { organizationId: orgId }, _count: true }),
        prisma.question.groupBy({
          by: ['topic'], where: { organizationId: orgId }, _count: true,
          orderBy: { _count: { topic: 'desc' } }, take: 10,
        }),
      ]);

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const generatedToday = await prisma.question.count({
        where: { organizationId: orgId, createdAt: { gte: today } },
      });

      const analytics = {
        totalQuestions,
        generatedToday,
        byStatus: Object.fromEntries(byStatus.map((s: any) => [s.status, s._count])),
        byType: Object.fromEntries(byType.map((t: any) => [t.type, t._count])),
        byDifficulty: Object.fromEntries(byDifficulty.map((d: any) => [d.difficulty, d._count])),
        topTopics: byTopic.map((t: any) => ({ topic: t.topic, count: t._count })),
      };

      await redisClient.set(cacheKey, JSON.stringify(analytics), 'EX', 60);

      res.json({ success: true, cached: false, analytics });
    } catch (err) { next(err); }
  }

  static async getValidationRate(req: Request, res: Response, next: NextFunction) {
    try {
      const orgId = req.user!.organizationId;
      const cacheKey = `analytics:validation-rate:${orgId}`;

      const cached = await redisClient.get(cacheKey);
      if (cached) {
        return res.json({ success: true, cached: true, ...JSON.parse(cached) });
      }

      const [validated, failed, total] = await Promise.all([
        prisma.question.count({ where: { organizationId: orgId, status: { in: ['VALIDATED', 'APPROVED'] } } }),
        prisma.question.count({ where: { organizationId: orgId, status: 'FAILED' } }),
        prisma.question.count({ where: { organizationId: orgId } }),
      ]);

      const result = {
        validationRate: total > 0 ? ((validated / total) * 100).toFixed(1) : '0',
        failureRate: total > 0 ? ((failed / total) * 100).toFixed(1) : '0',
        validated,
        failed,
        total,
      };

      await redisClient.set(cacheKey, JSON.stringify(result), 'EX', 120);

      res.json({ success: true, cached: false, ...result });
    } catch (err) { next(err); }
  }
}
