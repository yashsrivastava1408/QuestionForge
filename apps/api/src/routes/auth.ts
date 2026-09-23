import { Router } from 'express';
import { AuthController } from '../controllers/authController.js';
import { authenticate } from '../middleware/auth.js';

export const authRouter = Router();

// POST /api/auth/login
authRouter.post('/login', AuthController.login);

// POST /api/auth/register
authRouter.post('/register', AuthController.register);

// POST /api/auth/logout — Revoke current token so it can't be reused
authRouter.post('/logout', authenticate, AuthController.logout);

// GET /api/auth/me
authRouter.get('/me', authenticate, AuthController.me);
