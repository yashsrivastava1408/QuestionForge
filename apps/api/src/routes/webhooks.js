import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../utils/prisma.js';
import { authenticate, authorize } from '../middleware/auth.js';
import crypto from 'crypto';
import fetch from 'node-fetch';
export const webhooksRouter = Router();
// POST /api/webhooks/configure — Set webhook URL for org
webhooksRouter.post('/configure', authenticate, authorize('ADMIN'), async (req, res, next) => {
    try {
        const { webhookUrl } = z.object({ webhookUrl: z.string().url() }).parse(req.body);
        const webhookSecret = crypto.randomBytes(32).toString('hex');
        await prisma.organization.update({
            where: { id: req.user.organizationId },
            data: { webhookUrl, webhookSecret },
        });
        res.json({ success: true, webhookSecret, message: 'Webhook configured. Store your secret securely — it will not be shown again.' });
    }
    catch (err) {
        next(err);
    }
});
// Internal helper used by other services
export async function triggerWebhook(organizationId, payload) {
    const org = await prisma.organization.findUnique({
        where: { id: organizationId },
        select: { webhookUrl: true, webhookSecret: true },
    });
    if (!org?.webhookUrl)
        return;
    const body = JSON.stringify(payload);
    const sig = crypto.createHmac('sha256', org.webhookSecret).update(body).digest('hex');
    try {
        await fetch(org.webhookUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-QuestionForge-Signature': `sha256=${sig}`,
            },
            body,
        });
        await prisma.auditLog.create({
            data: {
                organizationId,
                action: 'WEBHOOK_TRIGGERED',
                metadata: { url: org.webhookUrl, event: payload.event },
            },
        });
    }
    catch (err) {
        console.error('Webhook delivery failed:', err);
    }
}
//# sourceMappingURL=webhooks.js.map