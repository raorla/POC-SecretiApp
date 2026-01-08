import { Router, Request, Response } from 'express';
import { IExecService } from '../services/iexec';
import { z } from 'zod';
import { validateRequest } from '../middleware/validate';

const router = Router();

// Get task status
router.get('/:taskId', async (req: Request, res: Response) => {
  try {
    const { taskId } = req.params;
    
    const iexec = new IExecService();
    const task = await iexec.getTaskDetails(taskId);
    
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    res.json(task);
  } catch (error) {
    console.error('Get task error:', error);
    res.status(500).json({ error: 'Failed to get task' });
  }
});

// Get task result (computed file)
router.get('/:taskId/result', async (req: Request, res: Response) => {
  try {
    const { taskId } = req.params;
    
    const iexec = new IExecService();
    const result = await iexec.waitForTaskResult(taskId, 5000); // Short timeout for polling
    
    if (!result) {
      return res.status(404).json({ error: 'Result not available' });
    }

    res.json(result);
  } catch (error) {
    console.error('Get task result error:', error);
    res.status(500).json({ error: 'Failed to get task result' });
  }
});

// List user's tasks
router.get('/user/:userAddress', async (req: Request, res: Response) => {
  try {
    const { userAddress } = req.params;
    
    // User tasks tracking would require a database
    // For now, return empty array
    res.json([]);
  } catch (error) {
    console.error('Get user tasks error:', error);
    res.status(500).json({ error: 'Failed to get user tasks' });
  }
});

export default router;
