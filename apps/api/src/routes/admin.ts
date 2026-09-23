import { Router } from 'express';
import { AdminController } from '../controllers/adminController.js';
import { authenticate, authorize } from '../middleware/auth.js';

export const adminRouter = Router();

// POST /api/admin/organizations — Create a new org (super-admin only)
adminRouter.post('/organizations', authenticate, authorize('ADMIN'), AdminController.createOrganization);

// GET /api/admin/audit-logs — Fetch audit trail
adminRouter.get('/audit-logs', authenticate, authorize('ADMIN'), AdminController.getAuditLogs);

// GET /api/admin/users — List users in org
adminRouter.get('/users', authenticate, authorize('ADMIN'), AdminController.listUsers);

// PATCH /api/admin/users/:id/role — Change user role (org-scoped)
adminRouter.patch('/users/:id/role', authenticate, authorize('ADMIN'), AdminController.updateUserRole);

// GET /api/admin/queues/stats — Real-time telemetry for background BullMQ queues
adminRouter.get('/queues/stats', authenticate, authorize('ADMIN'), AdminController.getQueueStats);
