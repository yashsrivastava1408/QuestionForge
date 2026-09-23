import { Router } from 'express';
import { PapersController } from '../controllers/papersController.js';
import { authenticate, authorize } from '../middleware/auth.js';

export const papersRouter = Router();

// POST /api/papers — Create a new paper
papersRouter.post('/', authenticate, authorize('ADMIN', 'GENERATOR'), PapersController.create);

// GET /api/papers — List papers
papersRouter.get('/', authenticate, PapersController.list);

// GET /api/papers/:id — Get single paper
papersRouter.get('/:id', authenticate, PapersController.getById);
