import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../utils/prisma.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { AppError } from '../middleware/errorHandler.js';

export const adminRouter = Router();

// POST /api/admin/organizations — Create a new org (super-admin only)
adminRouter.post('/organizations', authenticate, authorize('ADMIN'), async (req, res, next) => {
  try {
    const { name, slug } = z.object({
      name: z.string().min(2),
      slug: z.string().min(2).regex(/^[a-z0-9-]+$/),
    }).parse(req.body);

    const org = await prisma.organization.create({ data: { name, slug } });
    res.status(201).json({ success: true, organization: org });
  } catch (err) { next(err); }
});

// GET /api/admin/audit-logs — Fetch audit trail
adminRouter.get('/audit-logs', authenticate, authorize('ADMIN'), async (req, res, next) => {
  try {
    const { page = '1', limit = '50', action } = req.query;
    const skip = (Number(page) - 1) * Number(limit);
    const where: any = { organizationId: req.user!.organizationId };
    if (action) where.action = action;

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        skip,
        take: Number(limit),
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { name: true, email: true } } },
      }),
      prisma.auditLog.count({ where }),
    ]);

    res.json({ success: true, logs, pagination: { total, page: Number(page), limit: Number(limit) } });
  } catch (err) { next(err); }
});

// GET /api/admin/users — List users in org
adminRouter.get('/users', authenticate, authorize('ADMIN'), async (req, res, next) => {
  try {
    const users = await prisma.user.findMany({
      where: { organizationId: req.user!.organizationId },
      select: { id: true, name: true, email: true, role: true, createdAt: true },
    });
    res.json({ success: true, users });
  } catch (err) { next(err); }
});

// PATCH /api/admin/users/:id/role — Change user role (org-scoped)
adminRouter.patch('/users/:id/role', authenticate, authorize('ADMIN'), async (req, res, next) => {
  try {
    const { role } = z.object({ role: z.enum(['ADMIN', 'REVIEWER', 'GENERATOR']) }).parse(req.body);

    // Verify the target user belongs to the same org as the requesting admin.
    // Without this check, an admin could promote/demote users from other orgs.
    const target = await prisma.user.findFirst({
      where: { id: req.params.id, organizationId: req.user!.organizationId },
    });
    if (!target) throw new AppError('User not found', 404);

    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { role },
      select: { id: true, name: true, email: true, role: true },
    });
    res.json({ success: true, user });
  } catch (err) { next(err); }
});
