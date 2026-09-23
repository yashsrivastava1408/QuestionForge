import { Router } from 'express';
import { prisma } from '../utils/prisma.js';
import { authenticate } from '../middleware/auth.js';
import { redisClient } from '../utils/redis.js';

export const analyticsRouter = Router();

/**
 * GET /api/analytics/overview — Dashboard metrics for the org
 *
 * Cached in Redis for 60 seconds to avoid running 6+ DB aggregation queries
 * on every dashboard page load. Cache is keyed per organization.
 */
analyticsRouter.get('/overview', authenticate, async (req, res, next) => {
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

    // Cache for 60 seconds — stale-while-revalidate style
    await redisClient.set(cacheKey, JSON.stringify(analytics), 'EX', 60);

    res.json({ success: true, cached: false, analytics });
  } catch (err) { next(err); }
});

/**
 * GET /api/analytics/validation-rate — Sandbox pass rates
 * Cached for 120 seconds — changes less frequently than overview.
 */
analyticsRouter.get('/validation-rate', authenticate, async (req, res, next) => {
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
});
