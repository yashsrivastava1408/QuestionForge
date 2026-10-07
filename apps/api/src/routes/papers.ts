import { Router } from 'express';
import { PapersController } from '../controllers/papersController.js';
import { authenticate, authorize } from '../middleware/auth.js';

export const papersRouter = Router();

// POST /api/papers — Create a new paper
papersRouter.post('/', authenticate, authorize('ADMIN', 'GENERATOR'), PapersController.create);

// GET /api/papers — List papers
papersRouter.get('/', authenticate, PapersController.list);

// GET /api/papers/availability — Approved question counts per type and difficulty
papersRouter.get('/availability', authenticate, PapersController.availability);

// POST /api/papers/assemble — Build a paper from a blueprint (random draw from APPROVED questions)
papersRouter.post('/assemble', authenticate, authorize('ADMIN', 'GENERATOR'), PapersController.assemble);

// PATCH /api/papers/:id — Rename, reorder, add or remove questions
papersRouter.patch('/:id', authenticate, authorize('ADMIN', 'GENERATOR'), PapersController.update);

// GET /api/papers/:id — Get single paper
papersRouter.get('/:id', authenticate, PapersController.getById);
