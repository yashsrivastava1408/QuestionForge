import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { generationQueue } from '../queues/generationQueue.js';
import { webhookQueue } from '../queues/webhookQueue.js';
import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { redisClient } from '../utils/redis.js';
import { logger } from '../utils/logger.js';

const SESSION_COOKIE = 'qf_bb_session';
const TICKET_PREFIX = 'bullboard:ticket:';

function readCookie(req: Request, name: string): string | undefined {
  const match = req.headers.cookie?.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : undefined;
}

/**
 * Authentication guard for the Bull Board UI.
 *
 * The dashboard is opened by browser navigation, which cannot send an
 * Authorization header. Instead of accepting the user's JWT in the URL:
 *  1. The admin console calls POST /api/admin/queues/ticket (normal Bearer auth)
 *     and receives a random ticket that lives 60 seconds in Redis.
 *  2. The browser opens /admin/queues?ticket=…. The ticket is consumed
 *     atomically (GETDEL — it works exactly once), exchanged for an httpOnly
 *     session cookie, and the browser is redirected to the clean URL.
 *  3. The cookie holds a 1-hour JWT with scope "bullboard", which the API's
 *     normal `authenticate` middleware refuses — it opens this dashboard only.
 */
export async function bullBoardAuthMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const secret = process.env.JWT_SECRET!;

    if (typeof req.query.ticket === 'string' && /^[0-9a-f]{64}$/.test(req.query.ticket)) {
      const stored = await redisClient.getdel(`${TICKET_PREFIX}${req.query.ticket}`);
      if (!stored) return renderAuthError(req, res, 'This link has expired or was already used. Open the dashboard from the Admin Console again.');

      const { userId, organizationId } = JSON.parse(stored);
      const session = jwt.sign({ userId, organizationId, role: 'ADMIN', scope: 'bullboard' }, secret, { expiresIn: '1h' });
      res.cookie(SESSION_COOKIE, session, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        path: '/admin/queues',
        maxAge: 3600 * 1000,
      });
      return res.redirect('/admin/queues');
    }

    const session = readCookie(req, SESSION_COOKIE);
    if (!session) {
      return renderAuthError(req, res, 'Authentication required to access the queue dashboard.');
    }

    const decoded = jwt.verify(session, secret) as { role?: string; scope?: string };
    if (decoded.scope !== 'bullboard' || decoded.role !== 'ADMIN') {
      return renderAuthError(req, res, 'Forbidden: Administrator privileges required.');
    }

    next();
  } catch (err: any) {
    logger.warn('[BullBoard] Auth failed', { error: err.message });
    return renderAuthError(req, res, 'Invalid or expired session.');
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
              Open this dashboard from <code>Admin Console → Queues → Open Bull Board</code>.
              It signs you in with a one-time link.
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
