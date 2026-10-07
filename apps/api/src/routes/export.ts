import { Router } from 'express';
import { ExportController } from '../controllers/exportController.js';
import { authenticate, authorize } from '../middleware/auth.js';

export const exportRouter = Router();

// POST /api/export — Generate export, store it (S3 or local disk), return a short-lived download URL
exportRouter.post('/', authenticate, authorize('ADMIN', 'REVIEWER'), ExportController.exportPaper);

// GET /api/export/download/:token — Download a locally-stored export (token is the credential)
exportRouter.get('/download/:token', ExportController.download);
