/**
 * API Service - Handles all backend communication
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

// Types
export interface Session {
  id: string;
  userAddress: string;
  aiProvider: string;
  status: 'pending' | 'active' | 'expired' | 'revoked' | 'failed';
  sessionKey?: { key: string; iv: string };
  createdAt: string;
  expiresAt: string;
  taskId?: string;
}

export interface CreateSessionParams {
  userAddress: string;
  aiProvider: 'openai' | 'anthropic' | 'huggingface' | 'custom';
  encryptedApiKey: string;
  sessionDuration?: number;
}

export interface CreateSessionResponse {
  sessionId: string;
  status: string;
  sessionKey?: { key: string; iv: string };
  expiresAt: string;
  message: string;
  simulationMode?: boolean;
}

export interface PromptParams {
  sessionId: string;
  prompt: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface PromptResponse {
  promptId: string;
  status: string;
  response?: string;
  model?: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  message?: string;
  error?: string;
}

export interface PromptHistory {
  id: string;
  sessionId: string;
  encryptedPrompt: string;
  encryptedResult?: string;
  model: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  createdAt: string;
  completedAt?: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

/**
 * API Error handling
 */
class APIError extends Error {
  constructor(public status: number, message: string, public details?: string) {
    super(message);
    this.name = 'APIError';
  }
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new APIError(
      response.status,
      data.error || 'API request failed',
      data.details
    );
  }
  return response.json();
}

/**
 * Session API
 */
export const sessionApi = {
  /**
   * Create a new session
   */
  async create(params: CreateSessionParams): Promise<CreateSessionResponse> {
    const response = await fetch(`${API_URL}/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    return handleResponse<CreateSessionResponse>(response);
  },

  /**
   * Get session by ID
   */
  async get(sessionId: string): Promise<Session> {
    const response = await fetch(`${API_URL}/sessions/${sessionId}`);
    return handleResponse<Session>(response);
  },

  /**
   * Get all sessions for a user
   */
  async getByUser(userAddress: string): Promise<Session[]> {
    const response = await fetch(`${API_URL}/sessions/user/${userAddress}`);
    return handleResponse<Session[]>(response);
  },

  /**
   * Revoke a session
   */
  async revoke(sessionId: string): Promise<{ message: string }> {
    const response = await fetch(`${API_URL}/sessions/${sessionId}`, {
      method: 'DELETE',
    });
    return handleResponse<{ message: string }>(response);
  },
};

/**
 * Prompt API
 */
export const promptApi = {
  /**
   * Submit a prompt
   */
  async submit(params: PromptParams): Promise<PromptResponse> {
    const response = await fetch(`${API_URL}/prompts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    return handleResponse<PromptResponse>(response);
  },

  /**
   * Get prompt by ID
   */
  async get(promptId: string): Promise<PromptHistory> {
    const response = await fetch(`${API_URL}/prompts/${promptId}`);
    return handleResponse<PromptHistory>(response);
  },

  /**
   * Get all prompts for a session
   */
  async getBySession(sessionId: string): Promise<PromptHistory[]> {
    const response = await fetch(`${API_URL}/prompts/session/${sessionId}`);
    return handleResponse<PromptHistory[]>(response);
  },
};

/**
 * Health check
 */
export async function checkHealth(): Promise<{ status: string; timestamp: string }> {
  const response = await fetch(`${API_URL.replace('/api', '')}/health`);
  return handleResponse<{ status: string; timestamp: string }>(response);
}

export { APIError };
