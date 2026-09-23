import { Router } from 'express';
import { QuestionsController } from '../controllers/questionsController.js';
import { authenticate, authorize } from '../middleware/auth.js';

export const questionsRouter = Router();

// GET /api/questions — List questions for org (with filters)
questionsRouter.get('/', authenticate, QuestionsController.list);

// GET /api/questions/:id — Get single question (full detail)
questionsRouter.get('/:id', authenticate, QuestionsController.getById);

// PATCH /api/questions/:id — Edit question (creates new version, mass-assignment protected)
questionsRouter.patch('/:id', authenticate, authorize('ADMIN', 'REVIEWER'), QuestionsController.patch);

// POST /api/questions/:id/review — Approve or reject question
questionsRouter.post('/:id/review', authenticate, authorize('ADMIN', 'REVIEWER'), QuestionsController.review);
