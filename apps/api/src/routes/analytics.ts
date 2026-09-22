import { Router } from 'express';
import { prisma } from '../utils/prisma.js';
import { authenticate } from '../middleware/auth.js';

export const analyticsRouter = Router();

// GET /api/analytics/overview — Dashboard metrics for the org
analyticsRouter.get('/overview', authenticate, async (req, res, next) => {
  try {
    const orgId = req.user!.organizationId;

    const [totalQuestions, byStatus, byType, byDifficulty, byTopic] = await Promise.all([
      prisma.question.count({ where: { organizationId: orgId } }),
      prisma.question.groupBy({ by: ['status'], where: { organizationId: orgId }, _count: true }),
      prisma.question.groupBy({ by: ['type'], where: { organizationId: orgId }, _count: true }),
      prisma.question.groupBy({ by: ['difficulty'], where: { organizationId: orgId }, _count: true }),
      prisma.question.groupBy({ by: ['topic'], where: { organizationId: orgId }, _count: true, orderBy: { _count: { topic: 'desc' } }, take: 10 }),
    ]);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const generatedToday = await prisma.question.count({
      where: { organizationId: orgId, createdAt: { gte: today } },
    });

    res.json({
      success: true,
      analytics: {
        totalQuestions,
        generatedToday,
        byStatus: Object.fromEntries(byStatus.map((s: any) => [s.status, s._count])),
        byType: Object.fromEntries(byType.map((t: any) => [t.type, t._count])),
        byDifficulty: Object.fromEntries(byDifficulty.map((d: any) => [d.difficulty, d._count])),
        topTopics: byTopic.map((t: any) => ({ topic: t.topic, count: t._count })),
      },
    });
  } catch (err) { next(err); }
});

// GET /api/analytics/validation-rate — Sandbox pass rates
analyticsRouter.get('/validation-rate', authenticate, async (req, res, next) => {
  try {
    const orgId = req.user!.organizationId;
    const [validated, failed, total] = await Promise.all([
      prisma.question.count({ where: { organizationId: orgId, status: { in: ['VALIDATED', 'APPROVED'] } } }),
      prisma.question.count({ where: { organizationId: orgId, status: 'FAILED' } }),
      prisma.question.count({ where: { organizationId: orgId } }),
    ]);

    res.json({
      success: true,
      validationRate: total > 0 ? ((validated / total) * 100).toFixed(1) : '0',
      failureRate: total > 0 ? ((failed / total) * 100).toFixed(1) : '0',
      validated,
      failed,
      total,
    });
  } catch (err) { next(err); }
});
