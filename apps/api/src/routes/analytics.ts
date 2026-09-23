import { Router } from 'express';
import { AnalyticsController } from '../controllers/analyticsController.js';
import { authenticate } from '../middleware/auth.js';

export const analyticsRouter = Router();

// GET /api/analytics/overview — Dashboard metrics for the org (Redis cached 60s)
analyticsRouter.get('/overview', authenticate, AnalyticsController.getOverview);

// GET /api/analytics/validation-rate — Sandbox pass rates (Redis cached 120s)
analyticsRouter.get('/validation-rate', authenticate, AnalyticsController.getValidationRate);
