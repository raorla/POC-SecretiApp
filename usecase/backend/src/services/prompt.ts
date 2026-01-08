import { v4 as uuidv4 } from 'uuid';

// In-memory storage (replace with Redis/PostgreSQL in production)
const prompts = new Map<string, Prompt>();

export interface Prompt {
  id: string;
  sessionId: string;
  taskId?: string;
  encryptedPrompt: string;
  encryptedResult?: string;
  model: string;
  maxTokens: number;
  temperature: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  createdAt: Date;
  completedAt?: Date;
  error?: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

interface CreatePromptParams {
  sessionId: string;
  encryptedPrompt: string;
  model: string;
  maxTokens: number;
  temperature: number;
}

export class PromptService {
  /**
   * Create a new prompt
   */
  static async create(params: CreatePromptParams): Promise<Prompt> {
    const prompt: Prompt = {
      id: uuidv4(),
      sessionId: params.sessionId,
      encryptedPrompt: params.encryptedPrompt,
      model: params.model,
      maxTokens: params.maxTokens,
      temperature: params.temperature,
      status: 'pending',
      createdAt: new Date(),
    };
    
    prompts.set(prompt.id, prompt);
    
    return prompt;
  }
  
  /**
   * Get prompt by ID
   */
  static async getById(id: string): Promise<Prompt | null> {
    return prompts.get(id) || null;
  }
  
  /**
   * Get prompt by task ID
   */
  static async getByTaskId(taskId: string): Promise<Prompt | null> {
    for (const prompt of prompts.values()) {
      if (prompt.taskId === taskId) {
        return prompt;
      }
    }
    return null;
  }
  
  /**
   * Update prompt task ID
   */
  static async updateTaskId(promptId: string, taskId: string): Promise<void> {
    const prompt = prompts.get(promptId);
    if (prompt) {
      prompt.taskId = taskId;
      prompt.status = 'processing';
      prompts.set(promptId, prompt);
    }
  }
  
  /**
   * Complete prompt with result
   */
  static async complete(promptId: string, result: string, usage?: { promptTokens: number; completionTokens: number; totalTokens: number }): Promise<void> {
    const prompt = prompts.get(promptId);
    if (prompt) {
      prompt.status = 'completed';
      prompt.encryptedResult = result;
      prompt.completedAt = new Date();
      prompt.usage = usage;
      prompts.set(promptId, prompt);
    }
  }
  
  /**
   * Mark prompt as failed
   */
  static async fail(promptId: string, error: string): Promise<void> {
    const prompt = prompts.get(promptId);
    if (prompt) {
      prompt.status = 'failed';
      prompt.error = error;
      prompt.completedAt = new Date();
      prompts.set(promptId, prompt);
    }
  }
  
  /**
   * Get all prompts for a session
   */
  static async getBySessionId(sessionId: string): Promise<Prompt[]> {
    const sessionPrompts: Prompt[] = [];
    for (const prompt of prompts.values()) {
      if (prompt.sessionId === sessionId) {
        sessionPrompts.push(prompt);
      }
    }
    return sessionPrompts.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }
  
  /**
   * Get prompts statistics for a session
   */
  static async getSessionStats(sessionId: string): Promise<{
    total: number;
    completed: number;
    failed: number;
    pending: number;
    totalTokens: number;
  }> {
    const sessionPrompts = await this.getBySessionId(sessionId);
    
    const stats = {
      total: sessionPrompts.length,
      completed: 0,
      failed: 0,
      pending: 0,
      totalTokens: 0,
    };
    
    for (const prompt of sessionPrompts) {
      if (prompt.status === 'completed') {
        stats.completed++;
        stats.totalTokens += prompt.usage?.totalTokens || 0;
      } else if (prompt.status === 'failed') {
        stats.failed++;
      } else {
        stats.pending++;
      }
    }
    
    return stats;
  }
}
