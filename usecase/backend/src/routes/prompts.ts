import { Router, Request, Response } from 'express';
import { SessionService } from '../services/session';
import { PromptService } from '../services/prompt';
import { AIService } from '../services/ai';
import { sessionKeys } from './sessions';
import { z } from 'zod';
import { validateRequest } from '../middleware/validate';

const router = Router();

// Check if we're in simulation mode (evaluated at runtime)
const isSimulationMode = () => process.env.SIMULATION_MODE !== 'false';

// Request schemas
const submitPromptSchema = z.object({
  body: z.object({
    sessionId: z.string().uuid(),
    prompt: z.string().min(1), // Plain text prompt in simulation mode
    encryptedPrompt: z.string().optional(), // Encrypted prompt in production mode
    model: z.string().optional().default('gpt-4'),
    maxTokens: z.number().min(1).max(4096).optional().default(1024),
    temperature: z.number().min(0).max(2).optional().default(0.7),
  })
});

// Submit an AI prompt
router.post('/',
  validateRequest(submitPromptSchema),
  async (req: Request, res: Response) => {
    try {
      const { sessionId, prompt, encryptedPrompt, model, maxTokens, temperature } = req.body;

      // Verify session exists and is active
      const session = await SessionService.getById(sessionId);
      
      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }

      if (session.status !== 'active') {
        return res.status(400).json({ 
          error: 'Session is not active',
          status: session.status 
        });
      }

      if (new Date(session.expiresAt) < new Date()) {
        return res.status(400).json({ error: 'Session has expired' });
      }

      // Create prompt record
      const promptRecord = await PromptService.create({
        sessionId,
        encryptedPrompt: encryptedPrompt || prompt,
        model,
        maxTokens,
        temperature,
      });

      if (isSimulationMode()) {
        // Simulation mode: Process immediately
        const sessionData = sessionKeys.get(sessionId);
        
        if (!sessionData) {
          return res.status(400).json({ error: 'Session key not found' });
        }

        console.log(`🤖 [SIMULATION] Processing prompt for session ${sessionId}`);
        console.log(`📝 Prompt: ${prompt?.substring(0, 50)}...`);

        try {
          let aiResponse;
          
          // Check if we have a real API key (not starting with "demo" or "test")
          const apiKey = sessionData.apiKey;
          const isRealApiKey = apiKey && !apiKey.toLowerCase().startsWith('demo') && !apiKey.toLowerCase().startsWith('test') && apiKey.length > 20;
          
          if (isRealApiKey) {
            // Use real AI API
            console.log(`🔑 Using real ${session.aiProvider} API`);
            aiResponse = await AIService.execute({
              prompt: prompt || encryptedPrompt || '',
              model,
              maxTokens,
              temperature,
              apiKey,
              provider: session.aiProvider as 'openai' | 'anthropic',
            });
          } else {
            // Use simulation
            console.log('🎭 Using simulated AI response');
            aiResponse = await AIService.simulate(prompt || 'demo prompt', model);
          }

          // Update prompt with result
          await PromptService.complete(promptRecord.id, aiResponse.content, aiResponse.usage);

          return res.status(201).json({
            promptId: promptRecord.id,
            status: 'completed',
            response: aiResponse.content,
            model: aiResponse.model,
            usage: aiResponse.usage,
            simulationMode: true,
            message: isRealApiKey ? 'Response from real AI API' : '[SIMULATION] Demo response',
          });
        } catch (aiError) {
          console.error('AI API error:', aiError);
          await PromptService.fail(promptRecord.id, aiError instanceof Error ? aiError.message : 'AI API error');
          
          return res.status(500).json({
            promptId: promptRecord.id,
            status: 'failed',
            error: aiError instanceof Error ? aiError.message : 'AI API error',
          });
        }
      }

      // Production mode: Use iExec AIOracle
      const { IExecService } = await import('../services/iexec');
      const iexec = new IExecService();
      
      // Use the provider from session
      const provider = session.aiProvider || 'openai';
      
      // Get the session key and encrypted API key
      const sessionData = sessionKeys.get(sessionId);
      if (!sessionData || !sessionData.apiKey) {
        return res.status(400).json({ error: 'Session API key not found. Please create a new session.' });
      }
      
      // Pass session key for decryption + encrypted API key
      // The AI Oracle will decrypt the API key in TEE
      const { taskId, dealId } = await iexec.runAIOracle({
        provider,
        model,
        maxTokens,
        prompt: encryptedPrompt || prompt,
        sessionKey: { key: sessionData.key, iv: sessionData.iv },
        encryptedApiKey: sessionData.apiKey,
      });

      await PromptService.updateTaskId(promptRecord.id, taskId);

      // Wait for TEE result (up to 5 minutes)
      console.log(`⏳ Waiting for AI Oracle TEE task ${taskId}...`);
      try {
        const result = await iexec.waitForTaskResult<{
          success: boolean;
          response?: string;
          model?: string;
          usage?: any;
          error?: string;
        }>(taskId, 300000);

        if (result.success && result.response) {
          await PromptService.complete(promptRecord.id, result.response, result.usage);
          console.log(`✅ AI Oracle task completed!`);
          
          return res.status(201).json({
            promptId: promptRecord.id,
            taskId,
            dealId,
            status: 'completed',
            response: result.response,
            model: result.model,
            usage: result.usage,
          });
        } else {
          const errorMsg = result.error || 'Unknown TEE error';
          await PromptService.fail(promptRecord.id, errorMsg);
          
          return res.status(500).json({
            promptId: promptRecord.id,
            taskId,
            dealId,
            status: 'failed',
            error: errorMsg,
          });
        }
      } catch (waitError) {
        console.error('Error waiting for TEE result:', waitError);
        return res.status(500).json({
          promptId: promptRecord.id,
          taskId,
          dealId,
          status: 'failed',
          error: waitError instanceof Error ? waitError.message : 'Failed to get TEE result',
        });
      }
    } catch (error) {
      console.error('Submit prompt error:', error);
      res.status(500).json({ 
        error: 'Failed to submit prompt',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
);

// Get prompt result
router.get('/:promptId', async (req: Request, res: Response) => {
  try {
    const { promptId } = req.params;
    
    const prompt = await PromptService.getById(promptId);
    
    if (!prompt) {
      return res.status(404).json({ error: 'Prompt not found' });
    }

    res.json(prompt);
  } catch (error) {
    console.error('Get prompt error:', error);
    res.status(500).json({ error: 'Failed to get prompt' });
  }
});

// Get all prompts for a session
router.get('/session/:sessionId', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const prompts = await PromptService.getBySessionId(sessionId);
    
    res.json(prompts);
  } catch (error) {
    console.error('Get session prompts error:', error);
    res.status(500).json({ error: 'Failed to get prompts' });
  }
});

export default router;
