import type { Request, Response, NextFunction } from 'express';
import { prisma } from '../utils/prisma.js';
import { redisClient } from '../utils/redis.js';

export class AnalyticsController {
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
