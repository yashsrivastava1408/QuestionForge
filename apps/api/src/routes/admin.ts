import { Router } from 'express';
import { AdminController } from '../controllers/adminController.js';
import { authenticate, authorize } from '../middleware/auth.js';

export const adminRouter = Router();

// POST /api/admin/organizations — Create a new org (platform operators listed in SUPERADMIN_EMAILS only)
adminRouter.post('/organizations', authenticate, authorize('ADMIN'), AdminController.createOrganization);

// GET /api/admin/audit-logs — Fetch audit trail
adminRouter.get('/audit-logs', authenticate, authorize('ADMIN'), AdminController.getAuditLogs);

// GET /api/admin/users — List users in org
adminRouter.get('/users', authenticate, authorize('ADMIN'), AdminController.listUsers);

// PATCH /api/admin/users/:id/role — Change user role (org-scoped)
adminRouter.patch('/users/:id/role', authenticate, authorize('ADMIN'), AdminController.updateUserRole);

// GET /api/admin/queues/stats — Real-time telemetry for background BullMQ queues
adminRouter.get('/queues/stats', authenticate, authorize('ADMIN'), AdminController.getQueueStats);

// POST /api/admin/queues/ticket — One-time ticket to open the Bull Board UI without a token in the URL
adminRouter.post('/queues/ticket', authenticate, authorize('ADMIN'), AdminController.createQueueDashboardTicket);

// GET/PUT /api/admin/llm-keys — Per-organization LLM API keys (BYOK), encrypted at rest
adminRouter.get('/llm-keys', authenticate, authorize('ADMIN'), AdminController.getLlmKeys);
adminRouter.put('/llm-keys', authenticate, authorize('ADMIN'), AdminController.setLlmKey);

// PATCH /api/admin/users/:id/status — Deactivate / reactivate a user
adminRouter.patch('/users/:id/status', authenticate, authorize('ADMIN'), AdminController.setUserActive);

// POST /api/admin/users/:id/reset-password — Set a new password for a user
adminRouter.post('/users/:id/reset-password', authenticate, authorize('ADMIN'), AdminController.resetUserPassword);
