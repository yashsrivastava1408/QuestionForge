import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { prisma } from '../utils/prisma.js';
import { AppError } from '../middleware/errorHandler.js';
import { authenticate } from '../middleware/auth.js';
export const authRouter = Router();
const loginSchema = z.object({
    email: z.string().email(),
    password: z.string().min(8),
    organizationSlug: z.string(),
});
const registerSchema = z.object({
    email: z.string().email(),
    password: z.string().min(8),
    name: z.string().min(2),
    organizationSlug: z.string(),
    role: z.enum(['ADMIN', 'REVIEWER', 'GENERATOR']).optional(),
});
// POST /api/auth/login
authRouter.post('/login', async (req, res, next) => {
    try {
        const { email, password, organizationSlug } = loginSchema.parse(req.body);
        const org = await prisma.organization.findUnique({ where: { slug: organizationSlug } });
        if (!org)
            throw new AppError('Organization not found', 404);
        const user = await prisma.user.findFirst({
            where: { email, organizationId: org.id },
        });
        if (!user || !user.passwordHash)
            throw new AppError('Invalid credentials', 401);
        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid)
            throw new AppError('Invalid credentials', 401);
        const token = jwt.sign({ userId: user.id, email: user.email, role: user.role, organizationId: user.organizationId }, process.env.JWT_SECRET, { expiresIn: '24h' });
        // Audit log
        await prisma.auditLog.create({
            data: {
                organizationId: org.id,
                userId: user.id,
                action: 'USER_LOGIN',
                ipAddress: req.ip,
                userAgent: req.headers['user-agent'],
            },
        });
        res.json({ success: true, token, user: { id: user.id, email: user.email, name: user.name, role: user.role } });
    }
    catch (err) {
        next(err);
    }
});
// POST /api/auth/register
authRouter.post('/register', async (req, res, next) => {
    try {
        const { email, password, name, organizationSlug, role } = registerSchema.parse(req.body);
        const org = await prisma.organization.findUnique({ where: { slug: organizationSlug } });
        if (!org)
            throw new AppError('Organization not found', 404);
        const existing = await prisma.user.findFirst({ where: { email, organizationId: org.id } });
        if (existing)
            throw new AppError('User already exists', 409);
        const passwordHash = await bcrypt.hash(password, 12);
        const user = await prisma.user.create({
            data: { email, passwordHash, name, role: role ?? 'REVIEWER', organizationId: org.id },
        });
        const token = jwt.sign({ userId: user.id, email: user.email, role: user.role, organizationId: user.organizationId }, process.env.JWT_SECRET, { expiresIn: '24h' });
        res.status(201).json({ success: true, token, user: { id: user.id, email: user.email, name: user.name, role: user.role } });
    }
    catch (err) {
        next(err);
    }
});
// GET /api/auth/me
authRouter.get('/me', authenticate, async (req, res, next) => {
    try {
        const user = await prisma.user.findUnique({
            where: { id: req.user.userId },
            select: { id: true, email: true, name: true, role: true, organizationId: true, createdAt: true },
        });
        if (!user)
            throw new AppError('User not found', 404);
        res.json({ success: true, user });
    }
    catch (err) {
        next(err);
    }
});
//# sourceMappingURL=auth.js.map