import { Router } from 'express';
import { QuestionsController } from '../controllers/questionsController.js';
import { authenticate, authorize } from '../middleware/auth.js';

export const questionsRouter = Router();

// GET /api/questions — List questions for org (with filters)
questionsRouter.get('/', authenticate, QuestionsController.list);

// POST /api/questions/review-bulk — Approve or reject up to 100 validated questions in one call
questionsRouter.post('/review-bulk', authenticate, authorize('ADMIN', 'REVIEWER'), QuestionsController.reviewBulk);

// GET /api/questions/:id — Get single question (full detail)
questionsRouter.get('/:id', authenticate, QuestionsController.getById);

// PATCH /api/questions/:id — Edit question (creates new version, mass-assignment protected)
questionsRouter.patch('/:id', authenticate, authorize('ADMIN', 'REVIEWER'), QuestionsController.patch);

// POST /api/questions/:id/review — Approve or reject question
questionsRouter.post('/:id/review', authenticate, authorize('ADMIN', 'REVIEWER'), QuestionsController.review);

// POST /api/questions/:id/revalidate — Re-run validation (sandbox / review) on the current content
questionsRouter.post('/:id/revalidate', authenticate, authorize('ADMIN', 'REVIEWER'), QuestionsController.revalidate);

// POST /api/questions/:id/complete — Generate + validate solutions and tests for an imported DRAFT
questionsRouter.post('/:id/complete', authenticate, authorize('ADMIN', 'GENERATOR'), QuestionsController.complete);
