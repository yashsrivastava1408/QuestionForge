export type ExportFormat = 'JSON' | 'PDF_CANDIDATE' | 'PDF_INTERNAL';

export interface ExportRequest {
  paperId: string;
  format: ExportFormat;
  requestedById: string;
  watermarkText?: string;
}

export interface ExportRecord {
  id: string;
  paperId: string;
  format: ExportFormat;
  signedToken?: string;
  expiresAt?: string;
  createdAt: string;
}

export interface WebhookPayload {
  event:
    | 'question.validated'
    | 'question.approved'
    | 'question.rejected'
    | 'generation.completed'
    | 'paper.exported'
    | 'webhook.ping';
  timestamp: string;
  organizationId: string;
  data: Record<string, unknown>;
}
