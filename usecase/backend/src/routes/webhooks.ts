import { Router, Request, Response } from 'express';
import { SessionService } from '../services/session';
import { PromptService } from '../services/prompt';
import crypto from 'crypto';

const router = Router();

// Verify webhook signature
const verifyWebhookSignature = (req: Request): boolean => {
  const signature = req.headers['x-iexec-signature'] as string;
  const webhookSecret = process.env.WEBHOOK_SECRET;
  
  if (!signature || !webhookSecret) {
    return false;
  }
  
  const expectedSignature = crypto
    .createHmac('sha256', webhookSecret)
    .update(JSON.stringify(req.body))
    .digest('hex');
    
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
};

// Task completion webhook
router.post('/task-complete', async (req: Request, res: Response) => {
  try {
    // Verify signature in production
    if (process.env.NODE_ENV === 'production' && !verifyWebhookSignature(req)) {
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const { taskId, dealId, status, result } = req.body;
    
    console.log(`📬 Webhook received: Task ${taskId} - Status: ${status}`);

    // Check if this is a session creation task
    const session = await SessionService.getByTaskId(taskId);
    if (session) {
      if (status === 'COMPLETED') {
        await SessionService.activate(session.id, result);
        console.log(`✅ Session ${session.id} activated`);
      } else if (status === 'FAILED') {
        await SessionService.fail(session.id, result?.error || 'Task failed');
        console.log(`❌ Session ${session.id} failed`);
      }
      return res.json({ received: true, type: 'session' });
    }

    // Check if this is a prompt task
    const prompt = await PromptService.getByTaskId(taskId);
    if (prompt) {
      if (status === 'COMPLETED') {
        await PromptService.complete(prompt.id, result);
        console.log(`✅ Prompt ${prompt.id} completed`);
      } else if (status === 'FAILED') {
        await PromptService.fail(prompt.id, result?.error || 'Task failed');
        console.log(`❌ Prompt ${prompt.id} failed`);
      }
      return res.json({ received: true, type: 'prompt' });
    }

    res.json({ received: true, type: 'unknown' });
  } catch (error) {
    console.error('Webhook processing error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

export default router;
