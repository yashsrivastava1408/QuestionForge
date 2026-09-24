import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { generationQueue } from '../queues/generationQueue.js';
import { webhookQueue } from '../queues/webhookQueue.js';
import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { isTokenBlacklisted } from '../utils/redis.js';
import { logger } from '../utils/logger.js';

interface DecodedToken {
  id: string;
  email: string;
  role: string;
  organizationId: string;
  jti: string;
}

/**
 * Enterprise Authentication Guard for Bull Board UI.
 * Supports:
 *  1. Authorization: Bearer <token> header
 *  2. ?token=<token> query parameter (for direct browser navigation)
 *  3. qf_admin_token cookie (preserves session across static JS/CSS asset fetches)
 */
export async function bullBoardAuthMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    let token: string | undefined;

    // 1. Check Bearer header
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      token = authHeader.slice(7).trim();
    }

    // 2. Check query parameter (?token=...)
    if (!token && typeof req.query.token === 'string') {
      token = req.query.token;
    }

    // 3. Check cookie
    if (!token && req.headers.cookie) {
      const match = req.headers.cookie.match(/(?:^|;\s*)qf_admin_token=([^;]+)/);
      if (match) {
        token = decodeURIComponent(match[1]);
      }
    }

    if (!token) {
      return renderAuthError(req, res, 'Authentication required to access Bull Board dashboard.');
    }

    const secret = process.env.JWT_SECRET || 'secret';
    const decoded = jwt.verify(token, secret) as DecodedToken;

    // Check Redis revocation blacklist
    if (decoded.jti && (await isTokenBlacklisted(decoded.jti))) {
      return renderAuthError(req, res, 'Session has been revoked.');
    }

    // Verify ADMIN role
    if (decoded.role !== 'ADMIN') {
      return renderAuthError(req, res, 'Forbidden: Administrator privileges required.');
    }

    // Set cookie so browser requests for Bull Board static JS/CSS scripts stay authenticated
    res.cookie('qf_admin_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 3600 * 1000, // 1 hour
    });

    next();
  } catch (err: any) {
    logger.warn('[BullBoard] Auth failed', { error: err.message });
    return renderAuthError(req, res, 'Invalid or expired token.');
  }
}

function renderAuthError(req: Request, res: Response, message: string): void {
  if (req.accepts('html')) {
    res.status(401).send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Question Forge — Bull Board Access Denied</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f172a; color: #f8fafc; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
            .card { background: #1e293b; padding: 2.5rem; border-radius: 12px; border: 1px solid #334155; max-width: 480px; text-align: center; box-shadow: 0 10px 25px rgba(0,0,0,0.5); }
            h1 { color: #f43f5e; font-size: 1.5rem; margin-bottom: 0.5rem; }
            p { color: #94a3b8; font-size: 0.95rem; line-height: 1.5; margin-bottom: 1.5rem; }
            .hint { background: #0f172a; border-left: 4px solid #3b82f6; padding: 0.75rem 1rem; text-align: left; font-size: 0.85rem; color: #cbd5e1; border-radius: 4px; }
            code { color: #38bdf8; font-family: monospace; }
          </style>
        </head>
        <body>
          <div class="card">
            <h1>🔒 Administrator Authentication Required</h1>
            <p>${message}</p>
            <div class="hint">
              <strong>How to connect:</strong><br/>
              Navigate from the Question Forge Admin Console or append your admin token:<br/>
              <code>/admin/queues?token=&lt;your-admin-jwt&gt;</code>
            </div>
          </div>
        </body>
      </html>
    `);
  } else {
    res.status(401).json({ error: 'Unauthorized', message });
  }
}

/**
 * Creates and configures Bull Board Express Adapter.
 */
export function setupBullBoard(): ExpressAdapter {
  const serverAdapter = new ExpressAdapter();
  serverAdapter.setBasePath('/admin/queues');

  createBullBoard({
    queues: [
      new BullMQAdapter(generationQueue),
      new BullMQAdapter(webhookQueue),
    ],
    serverAdapter: serverAdapter,
  });

  return serverAdapter;
}
