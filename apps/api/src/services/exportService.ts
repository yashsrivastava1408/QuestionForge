import puppeteer from 'puppeteer';
import { AppError } from '../middleware/errorHandler.js';
import { uploadExportToS3, isS3Enabled } from './s3Service.js';
import { v4 as uuidv4 } from 'uuid';

interface PaperWithQuestions {
  title: string;
  organization: { name: string };
  questions: { order: number; question: any }[];
  id: string;
}

/**
 * Escapes HTML special characters to prevent XSS when inserting user-generated
 * question content (statements, options, explanations) into the Puppeteer HTML template.
 */
function escapeHtml(str: string): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function exportToJson(paper: PaperWithQuestions): string {
  const output = {
    paperId: paper.id,
    title: paper.title,
    organization: paper.organization.name,
    exportedAt: new Date().toISOString(),
    questions: paper.questions.map(pq => ({
      order: pq.order,
      id: pq.question.id,
      type: pq.question.type,
      difficulty: pq.question.difficulty,
      topic: pq.question.topic,
      title: pq.question.title,
      statement: pq.question.statement,
      options: pq.question.options,
      testCases: pq.question.testCases,
      tags: pq.question.tags,
    })),
  };
  return JSON.stringify(output, null, 2);
}

export async function exportToPdf(
  paper: PaperWithQuestions,
  format: 'PDF_CANDIDATE' | 'PDF_INTERNAL',
  watermarkText: string
): Promise<Buffer> {
  const includeAnswers = format === 'PDF_INTERNAL';
  const paperId = paper.id.slice(0, 8).toUpperCase();

  const html = buildPdfHtml(paper, includeAnswers, watermarkText, paperId);

  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '20mm', bottom: '20mm', left: '15mm', right: '15mm' },
    });
    return Buffer.from(pdfBuffer);
  } finally {
    await browser.close().catch(() => {});
  }
}

/**
 * Uploads a buffer to S3 and returns the presigned URL.
 * Throws AppError if S3 is not configured — prevents silent fallback to
 * ephemeral in-process memory, which breaks across multiple API replicas.
 */
export async function uploadAndGetExportUrl(
  buffer: Buffer,
  contentType: string,
  organizationId: string,
  paperId: string,
  ext: string,
  expiresInSeconds: number
): Promise<string> {
  if (!isS3Enabled()) {
    throw new AppError(
      'Export storage (AWS S3) is not configured. Please set S3_BUCKET_NAME, AWS_ACCESS_KEY_ID, and AWS_SECRET_ACCESS_KEY in your environment.',
      503
    );
  }

  const signedToken = uuidv4();
  const s3Key = `exports/${organizationId}/${paperId}_${signedToken}.${ext}`;
  const s3Url = await uploadExportToS3(s3Key, buffer, contentType, expiresInSeconds);

  if (!s3Url) {
    throw new AppError('Failed to upload export to S3. Please check your AWS credentials and bucket permissions.', 503);
  }

  return s3Url;
}

function buildPdfHtml(paper: PaperWithQuestions, includeAnswers: boolean, watermark: string, paperId: string): string {
  const questionsHtml = paper.questions.map((pq, idx) => {
    const q = pq.question;
    // All user-generated content is HTML-escaped before insertion to prevent XSS
    const optionsHtml = q.options
      ? q.options.map((o: any) => `<div class="option"><strong>${escapeHtml(o.id)})</strong> ${escapeHtml(o.text)}</div>`).join('')
      : '';
    const answerHtml = includeAnswers && q.answer
      ? `<div class="answer-block"><strong>✓ Answer:</strong> ${escapeHtml(q.answer)}<br/><em>${escapeHtml(q.explanation ?? '')}</em></div>`
      : '';
    return `
      <div class="question-block">
        <div class="q-header">
          <span class="q-num">Q${idx + 1}.</span>
          <span class="difficulty difficulty-${escapeHtml(q.difficulty.toLowerCase())}">${escapeHtml(q.difficulty)}</span>
          <span class="topic-tag">${escapeHtml(q.topic)}</span>
        </div>
        <div class="q-statement">${escapeHtml(q.statement)}</div>
        ${optionsHtml}
        ${answerHtml}
      </div>`;
  }).join('');

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8"/>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Inter', sans-serif; color: #1a1a2e; background: #fff; position: relative; }
  .watermark {
    position: fixed; top: 50%; left: 50%;
    transform: translate(-50%, -50%) rotate(-30deg);
    font-size: 72px; font-weight: 700;
    color: rgba(0,0,0,0.04); z-index: 0; pointer-events: none;
    white-space: nowrap; user-select: none;
  }
  .header { background: linear-gradient(135deg, #6366f1, #8b5cf6); color: white; padding: 24px 30px; }
  .header h1 { font-size: 22px; font-weight: 700; }
  .header-meta { font-size: 12px; opacity: 0.85; margin-top: 6px; }
  .paper-id { background: rgba(255,255,255,0.2); padding: 3px 10px; border-radius: 12px; font-family: monospace; }
  .questions-container { padding: 24px 30px; position: relative; z-index: 1; }
  .question-block { margin-bottom: 32px; padding: 20px; border: 1px solid #e5e7eb; border-radius: 10px; page-break-inside: avoid; }
  .q-header { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
  .q-num { font-size: 16px; font-weight: 700; color: #6366f1; }
  .difficulty { font-size: 11px; padding: 3px 10px; border-radius: 12px; font-weight: 600; }
  .difficulty-easy { background: #dcfce7; color: #166534; }
  .difficulty-medium { background: #fef9c3; color: #713f12; }
  .difficulty-hard { background: #fee2e2; color: #991b1b; }
  .topic-tag { font-size: 11px; background: #ede9fe; color: #6d28d9; padding: 3px 10px; border-radius: 12px; }
  .q-statement { font-size: 14px; line-height: 1.7; white-space: pre-wrap; margin-bottom: 14px; }
  .option { font-size: 14px; padding: 6px 10px; margin: 4px 0; background: #f9fafb; border-radius: 6px; }
  .answer-block { margin-top: 14px; padding: 12px; background: #f0fdf4; border-left: 4px solid #22c55e; border-radius: 6px; font-size: 13px; }
  .footer { text-align: center; font-size: 11px; color: #9ca3af; padding: 16px; border-top: 1px solid #e5e7eb; }
</style>
</head>
<body>
<div class="watermark">${escapeHtml(watermark)} • ${escapeHtml(paperId)}</div>
<div class="header">
  <h1>${escapeHtml(paper.title)}</h1>
  <div class="header-meta">
    ${escapeHtml(paper.organization.name)} &nbsp;|&nbsp; Paper ID: <span class="paper-id">${escapeHtml(paperId)}</span>
    &nbsp;|&nbsp; ${paper.questions.length} Questions
    &nbsp;|&nbsp; ${includeAnswers ? '📋 Internal Copy (with answers)' : '📝 Candidate Copy'}
  </div>
</div>
<div class="questions-container">${questionsHtml}</div>
<div class="footer">Generated by Question Forge • ${new Date().toLocaleDateString()} • Paper ${escapeHtml(paperId)}</div>
</body>
</html>`;
}
