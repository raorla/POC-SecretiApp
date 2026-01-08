import { Router } from 'express';
import sessionsRouter from './sessions';
import promptsRouter from './prompts';
import tasksRouter from './tasks';
import webhooksRouter from './webhooks';

export const router = Router();

// Session management routes
router.use('/sessions', sessionsRouter);

// AI prompt submission routes  
router.use('/prompts', promptsRouter);

// Task monitoring routes
router.use('/tasks', tasksRouter);

// Webhook callbacks from iExec
router.use('/webhooks', webhooksRouter);
