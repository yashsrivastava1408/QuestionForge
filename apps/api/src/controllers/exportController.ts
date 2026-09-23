import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../utils/prisma.js';
import { AppError } from '../middleware/errorHandler.js';
import { exportToPdf, exportToJson, uploadAndGetExportUrl } from '../services/exportService.js';

export const exportSchema = z.object({
  paperId: z.string(),
  format: z.enum(['JSON', 'PDF_CANDIDATE', 'PDF_INTERNAL']),
  watermarkText: z.string().optional(),
});

export class ExportController {
  static async exportPaper(req: Request, res: Response, next: NextFunction) {
    try {
      const { paperId, format, watermarkText } = exportSchema.parse(req.body);

      const paper = await prisma.paper.findFirst({
        where: { id: paperId, organizationId: req.user!.organizationId },
        include: {
          questions: { include: { question: true }, orderBy: { order: 'asc' } },
          organization: { select: { name: true } },
        },
      });
      if (!paper) throw new AppError('Paper not found', 404);

      const expiresInSeconds = Number(process.env.EXPORT_SIGNED_URL_EXPIRY_SECONDS ?? 300);
      const expiresAt = new Date(Date.now() + expiresInSeconds * 1000);

      let fileBuffer: Buffer;
      if (format === 'JSON') {
        fileBuffer = Buffer.from(exportToJson(paper as any), 'utf-8');
      } else {
        fileBuffer = await exportToPdf(paper as any, format, watermarkText ?? paper.organization.name);
      }

      const ext = format === 'JSON' ? 'json' : 'pdf';
      const contentType = format === 'JSON' ? 'application/json' : 'application/pdf';

      const downloadUrl = await uploadAndGetExportUrl(
        fileBuffer,
        contentType,
        req.user!.organizationId,
        paperId,
        ext,
        expiresInSeconds
      );

      const exportRecord = await prisma.exportRecord.create({
        data: {
          paperId,
          format,
          exportedById: req.user!.userId,
          expiresAt,
        },
      });

      await prisma.auditLog.create({
        data: {
          organizationId: req.user!.organizationId,
          userId: req.user!.userId,
          action: 'PAPER_EXPORTED',
          entityType: 'Paper',
          entityId: paperId,
          metadata: { format, exportRecordId: exportRecord.id },
          ipAddress: req.ip,
        },
      });

      res.json({
        success: true,
        downloadUrl,
        expiresAt: expiresAt.toISOString(),
        message: `Download link expires in ${expiresInSeconds} seconds.`,
      });
    } catch (err) { next(err); }
  }
}
