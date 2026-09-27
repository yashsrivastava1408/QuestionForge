import { Router } from 'express';
import { IngestionController } from '../controllers/ingestionController.js';
import { authenticate, authorize } from '../middleware/auth.js';

export const ingestionRouter = Router();

// POST /api/ingestion/fetch — Pull a single real problem by slug (LeetCode/GFG)
ingestionRouter.post('/fetch', authenticate, authorize('ADMIN'), IngestionController.fetchOne);

// POST /api/ingestion/fetch-category — Pull up to `limit` LeetCode problems for a tag/category
ingestionRouter.post('/fetch-category', authenticate, authorize('ADMIN'), IngestionController.fetchByCategory);
