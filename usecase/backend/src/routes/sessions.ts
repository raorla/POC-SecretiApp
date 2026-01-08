import { Router, Request, Response } from 'express';
import { SessionService } from '../services/session';
import { CryptoService } from '../services/ai';
import { z } from 'zod';
import { validateRequest } from '../middleware/validate';

const router = Router();

// In-memory storage for API keys (encrypted session keys)
// In production, this would be stored in iExec SMS
const sessionKeys = new Map<string, { key: string; iv: string; apiKey: string }>();

// Check if we're in simulation mode (evaluated at runtime)
const isSimulationMode = () => process.env.SIMULATION_MODE !== 'false';

// Request schemas
const createSessionSchema = z.object({
  body: z.object({
    userAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
    aiProvider: z.enum(['openai', 'anthropic', 'huggingface', 'custom']),
    encryptedApiKey: z.string().min(1),
    sessionDuration: z.number().min(300).max(86400).optional().default(3600),
  })
});

const getSessionSchema = z.object({
  params: z.object({
    sessionId: z.string().uuid(),
  })
});

// Create a new session
router.post('/', 
  validateRequest(createSessionSchema),
  async (req: Request, res: Response) => {
    try {
      const { userAddress, aiProvider, encryptedApiKey, sessionDuration } = req.body;

      // Create session record
      const session = await SessionService.create({
        userAddress,
        aiProvider,
        duration: sessionDuration,
      });

      if (isSimulationMode()) {
        // Simulation mode: Generate session key and store API key locally
        const sessionKey = CryptoService.generateSessionKey();
        
        // Store the session key and API key
        sessionKeys.set(session.id, {
          ...sessionKey,
          apiKey: encryptedApiKey, // In real mode, this would be encrypted in TEE
        });

        // Mark session as active immediately in simulation mode
        await SessionService.activate(session.id, { sessionKey: sessionKey.key });

        console.log(`🔐 [SIMULATION] Session created: ${session.id}`);

        return res.status(201).json({
          sessionId: session.id,
          status: 'active',
          sessionKey, // Return session key for encryption (in prod, this comes from TEE)
          expiresAt: session.expiresAt,
          message: '[SIMULATION] Session created. Ready to chat!',
          simulationMode: true,
        });
      }

      // Production mode: Use iExec
      const { IExecService } = await import('../services/iexec');
      const iexec = new IExecService();

      // Calculate expiration time
      const expiresAt = new Date(Date.now() + sessionDuration * 1000).toISOString();

      // Store original API key for later use with AI Oracle
      const originalApiKey = encryptedApiKey;

      const { taskId, dealId } = await iexec.runKeyManager({
        sessionId: session.id,
        apiKey: encryptedApiKey, // The user's API key
        expiresAt,
      });

      await SessionService.updateTaskId(session.id, taskId);

      // Wait for task result in background and activate session
      (async () => {
        try {
          console.log(`⏳ Waiting for TEE task ${taskId} to complete...`);
          const result = await iexec.waitForTaskResult<{
            success: boolean;
            sessionId: string;
            sessionKey: { key: string; iv: string };
            encryptedApiKey: string;
          }>(taskId, 300000); // 5 min timeout
          
          if (result.success) {
            // Store session key AND encrypted API key (from TEE)
            // The API key is now encrypted and can only be decrypted in TEE
            console.log('TEE Result - encryptedApiKey type:', typeof result.encryptedApiKey);
            console.log('TEE Result - encryptedApiKey (first 50 chars):', result.encryptedApiKey.substring(0, 50));
            
            sessionKeys.set(session.id, {
              key: result.sessionKey.key,
              iv: result.sessionKey.iv,
              apiKey: result.encryptedApiKey, // Store encrypted version from TEE
            });
            
            await SessionService.activate(session.id, { sessionKey: result.sessionKey.key });
            console.log(`✅ Session ${session.id} activated from TEE!`);
            console.log(`🔐 Encrypted API key stored (will be decrypted in TEE)`);
          }
        } catch (err) {
          console.error(`❌ Failed to activate session ${session.id}:`, err);
        }
      })();

      res.status(201).json({
        sessionId: session.id,
        taskId,
        dealId,
        status: 'pending',
        message: 'Session creation initiated. KeyManager iApp is generating secure session keys. Please wait ~1-2 minutes.',
      });
    } catch (error) {
      console.error('Session creation error:', error);
      res.status(500).json({ 
        error: 'Failed to create session',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
);

// Get session status
router.get('/:sessionId',
  validateRequest(getSessionSchema),
  async (req: Request, res: Response) => {
    try {
      const { sessionId } = req.params;
      
      const session = await SessionService.getById(sessionId);
      
      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }

      // Include session key info in simulation mode
      if (isSimulationMode() && sessionKeys.has(sessionId)) {
        const keyInfo = sessionKeys.get(sessionId)!;
        return res.json({
          ...session,
          hasSessionKey: true,
          sessionKey: { key: keyInfo.key, iv: keyInfo.iv },
        });
      }

      // If session has a task, check its status
      if (session.taskId) {
        const { IExecService } = await import('../services/iexec');
        const iexec = new IExecService();
        const taskStatus = await iexec.getTaskStatus(session.taskId);
        
        // If task completed, try to activate the session
        if (taskStatus === 'COMPLETED' && session.status !== 'active') {
          try {
            const result = await iexec.waitForTaskResult<{
              success: boolean;
              sessionId: string;
              sessionKey: { key: string; iv: string };
              encryptedApiKey: string;
            }>(session.taskId, 5000); // Short timeout since task is already complete
            
            if (result.success) {
              // Store session keys
              sessionKeys.set(sessionId, {
                key: result.sessionKey.key,
                iv: result.sessionKey.iv,
                apiKey: result.encryptedApiKey,
              });
              
              // Activate session
              await SessionService.activate(sessionId, { sessionKey: result.sessionKey.key });
              
              console.log(`✅ Session activated from TEE result: ${sessionId}`);
              
              return res.json({
                ...session,
                status: 'active',
                taskStatus,
                sessionKey: result.sessionKey,
                hasSessionKey: true,
              });
            }
          } catch (err) {
            console.error('Error fetching task result:', err);
          }
        }
        
        return res.json({
          ...session,
          taskStatus,
        });
      }

      res.json(session);
    } catch (error) {
      console.error('Get session error:', error);
      res.status(500).json({ error: 'Failed to get session' });
    }
  }
);

// Get all sessions for a user
router.get('/user/:userAddress', async (req: Request, res: Response) => {
  try {
    const { userAddress } = req.params;
    const sessions = await SessionService.getByUserAddress(userAddress);
    
    res.json(sessions);
  } catch (error) {
    console.error('Get user sessions error:', error);
    res.status(500).json({ error: 'Failed to get sessions' });
  }
});

// Revoke a session
router.delete('/:sessionId', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    
    // Remove session key from memory
    sessionKeys.delete(sessionId);
    
    await SessionService.revoke(sessionId);
    
    res.json({ 
      message: 'Session revoked successfully',
      sessionId 
    });
  } catch (error) {
    console.error('Revoke session error:', error);
    res.status(500).json({ error: 'Failed to revoke session' });
  }
});

// Export session keys map for use in prompts route
export { sessionKeys };

export default router;
