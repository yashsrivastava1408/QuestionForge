import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../utils/prisma.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { AppError } from '../middleware/errorHandler.js';
import { exportToPdf, exportToJson } from '../services/exportService.js';
import { v4 as uuidv4 } from 'uuid';
export const exportRouter = Router();
const exportSchema = z.object({
    paperId: z.string(),
    format: z.enum(['JSON', 'PDF_CANDIDATE', 'PDF_INTERNAL']),
    watermarkText: z.string().optional(),
});
// POST /api/export — Generate export and return ephemeral signed URL
exportRouter.post('/', authenticate, authorize('ADMIN', 'REVIEWER'), async (req, res, next) => {
    try {
        const { paperId, format, watermarkText } = exportSchema.parse(req.body);
        const paper = await prisma.paper.findFirst({
            where: { id: paperId, organizationId: req.user.organizationId },
            include: {
                questions: { include: { question: true }, orderBy: { order: 'asc' } },
                organization: { select: { name: true } },
            },
        });
        if (!paper)
            throw new AppError('Paper not found', 404);
        const signedToken = uuidv4();
        const expiresAt = new Date(Date.now() + Number(process.env.EXPORT_SIGNED_URL_EXPIRY_SECONDS ?? 300) * 1000);
        // Generate the export file
        let fileBuffer;
        if (format === 'JSON') {
            fileBuffer = Buffer.from(exportToJson(paper), 'utf-8');
        }
        else {
            fileBuffer = await exportToPdf(paper, format, watermarkText ?? paper.organization.name);
        }
        // Store export record with signed token
        const exportRecord = await prisma.exportRecord.create({
            data: {
                paperId,
                format,
                exportedById: req.user.userId,
                signedToken,
                expiresAt,
            },
        });
        // Store file temporarily (in production: S3/GCS pre-signed URL)
        // For now: store in-memory and serve via /api/export/download/:token
        global.__exports = global.__exports ?? {};
        global.__exports[signedToken] = { buffer: fileBuffer, format, expiresAt };
        await prisma.auditLog.create({
            data: {
                organizationId: req.user.organizationId,
                userId: req.user.userId,
                action: 'PAPER_EXPORTED',
                entityType: 'Paper',
                entityId: paperId,
                metadata: { format, exportRecordId: exportRecord.id },
                ipAddress: req.ip,
            },
        });
        res.json({
            success: true,
            downloadUrl: `/api/export/download/${signedToken}`,
            expiresAt: expiresAt.toISOString(),
            message: `Download link expires in ${process.env.EXPORT_SIGNED_URL_EXPIRY_SECONDS ?? 300} seconds.`,
        });
    }
    catch (err) {
        next(err);
    }
});
// GET /api/export/download/:token — Download the exported file
exportRouter.get('/download/:token', async (req, res, next) => {
    try {
        const record = await prisma.exportRecord.findUnique({
            where: { signedToken: req.params.token },
        });
        if (!record)
            throw new AppError('Invalid download link', 404);
        if (record.expiresAt && new Date() > record.expiresAt) {
            throw new AppError('Download link has expired', 410);
        }
        const fileData = global.__exports?.[req.params.token];
        if (!fileData)
            throw new AppError('File not found or expired', 404);
        await prisma.exportRecord.update({
            where: { id: record.id },
            data: { downloadedAt: new Date() },
        });
        if (record.format === 'JSON') {
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Content-Disposition', 'attachment; filename="paper.json"');
        }
        else {
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename="paper_${record.format.toLowerCase()}.pdf"`);
        }
        res.send(fileData.buffer);
    }
    catch (err) {
        next(err);
    }
});
//# sourceMappingURL=export.js.map