import { Router } from 'express';
import { ExportController } from '../controllers/exportController.js';
import { authenticate, authorize } from '../middleware/auth.js';

export const exportRouter = Router();

// POST /api/export — Generate export, upload to S3, return ephemeral signed URL
exportRouter.post('/', authenticate, authorize('ADMIN', 'REVIEWER'), ExportController.exportPaper);
