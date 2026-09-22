import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../utils/prisma.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { AppError } from '../middleware/errorHandler.js';
export const papersRouter = Router();
// POST /api/papers — Create a new paper
papersRouter.post('/', authenticate, authorize('ADMIN', 'GENERATOR'), async (req, res, next) => {
    try {
        const { title, questionIds, config } = z.object({
            title: z.string().min(1),
            questionIds: z.array(z.string()).min(1),
            config: z.record(z.unknown()).optional(),
        }).parse(req.body);
        const paper = await prisma.paper.create({
            data: {
                title,
                organizationId: req.user.organizationId,
                config: config ?? {},
                questions: {
                    create: questionIds.map((qId, idx) => ({ questionId: qId, order: idx + 1 })),
                },
            },
            include: { questions: { include: { question: { select: { id: true, title: true, difficulty: true, type: true } } } } },
        });
        res.status(201).json({ success: true, paper });
    }
    catch (err) {
        next(err);
    }
});
// GET /api/papers — List papers
papersRouter.get('/', authenticate, async (req, res, next) => {
    try {
        const papers = await prisma.paper.findMany({
            where: { organizationId: req.user.organizationId },
            include: { _count: { select: { questions: true } }, exports: { select: { format: true, createdAt: true } } },
            orderBy: { createdAt: 'desc' },
        });
        res.json({ success: true, papers });
    }
    catch (err) {
        next(err);
    }
});
// GET /api/papers/:id — Get single paper
papersRouter.get('/:id', authenticate, async (req, res, next) => {
    try {
        const paper = await prisma.paper.findFirst({
            where: { id: req.params.id, organizationId: req.user.organizationId },
            include: { questions: { include: { question: true }, orderBy: { order: 'asc' } }, exports: true },
        });
        if (!paper)
            throw new AppError('Paper not found', 404);
        res.json({ success: true, paper });
    }
    catch (err) {
        next(err);
    }
});
//# sourceMappingURL=papers.js.map