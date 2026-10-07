import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../utils/prisma.js';
import { AppError } from '../middleware/errorHandler.js';
import path from 'node:path';
import { createReadStream } from 'node:fs';
import { access } from 'node:fs/promises';
import { exportToPdf, exportToJson, storeExport, localExportDir } from '../services/exportService.js';

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

      const stored = await storeExport(
        fileBuffer,
        contentType,
        req.user!.organizationId,
        paperId,
        ext,
        expiresInSeconds
      );
      const downloadUrl = stored.downloadUrl;

      const exportRecord = await prisma.exportRecord.create({
        data: {
          paperId,
          format,
          exportedById: req.user!.userId,
          expiresAt,
          signedToken: stored.signedToken,
          storageKey: stored.storageKey,
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

  /**
   * GET /api/export/download/:token — serves a locally-stored export.
   * The unguessable, short-lived token IS the credential (same model as an S3
   * presigned URL), so the link works as a plain browser download.
   */
  static async download(req: Request, res: Response, next: NextFunction) {
    try {
      const token = req.params.token;
      if (!/^[0-9a-f]{64}$/.test(token)) throw new AppError('Download link not found', 404);

      const record = await prisma.exportRecord.findUnique({ where: { signedToken: token } });
      if (!record?.storageKey) throw new AppError('Download link not found', 404);
      if (!record.expiresAt || record.expiresAt.getTime() < Date.now()) {
        throw new AppError('This download link has expired. Export the paper again.', 410);
      }

      // storageKey is generated server-side; basename() is defence in depth against path traversal.
      const filePath = path.join(localExportDir(), path.basename(record.storageKey));
      await access(filePath).catch(() => { throw new AppError('Export file is no longer available. Export the paper again.', 410); });

      await prisma.exportRecord.update({ where: { id: record.id }, data: { downloadedAt: new Date() } });

      const isPdf = record.format !== 'JSON';
      res.setHeader('Content-Type', isPdf ? 'application/pdf' : 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="paper-${record.paperId}.${isPdf ? 'pdf' : 'json'}"`);
      res.setHeader('Cache-Control', 'private, no-store');
      createReadStream(filePath).on('error', next).pipe(res);
    } catch (err) { next(err); }
  }
}
