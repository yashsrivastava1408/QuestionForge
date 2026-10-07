import { Router } from 'express';
import { AuthController } from '../controllers/authController.js';
import { authenticate, authorize } from '../middleware/auth.js';

export const authRouter = Router();

// POST /api/auth/login
authRouter.post('/login', AuthController.login);

// POST /api/auth/register — Admin creates a user in their own organization (no public sign-up)
authRouter.post('/register', authenticate, authorize('ADMIN'), AuthController.register);

// POST /api/auth/logout — Revoke current token so it can't be reused
authRouter.post('/logout', authenticate, AuthController.logout);

// GET /api/auth/me
authRouter.get('/me', authenticate, AuthController.me);

// POST /api/auth/change-password — Change your own password (signs out your other sessions)
authRouter.post('/change-password', authenticate, AuthController.changePassword);
