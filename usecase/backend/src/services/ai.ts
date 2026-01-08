import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'crypto';

// Type definitions for API responses
interface OpenAIResponse {
  choices: Array<{ message: { content: string } }>;
  model: string;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

interface AnthropicResponse {
  content: Array<{ text: string }>;
  model: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

export interface AIRequest {
  prompt: string;
  model: string;
  maxTokens: number;
  temperature: number;
  apiKey: string;
  provider: 'openai' | 'anthropic';
}

export interface AIResponse {
  content: string;
  model: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

/**
 * Call OpenAI API
 */
async function callOpenAI(apiKey: string, prompt: string, model: string, maxTokens: number, temperature: number): Promise<AIResponse> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: model || 'gpt-4-turbo-preview',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: maxTokens,
      temperature: temperature,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error: ${error}`);
  }

  const data = await response.json() as OpenAIResponse;
  
  return {
    content: data.choices[0].message.content,
    model: data.model,
    usage: {
      promptTokens: data.usage.prompt_tokens,
      completionTokens: data.usage.completion_tokens,
      totalTokens: data.usage.total_tokens,
    },
  };
}

/**
 * Call Anthropic API
 */
async function callAnthropic(apiKey: string, prompt: string, model: string, maxTokens: number, temperature: number): Promise<AIResponse> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: model || 'claude-3-opus-20240229',
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Anthropic API error: ${error}`);
  }

  const data = await response.json() as AnthropicResponse;
  
  return {
    content: data.content[0].text,
    model: data.model,
    usage: {
      promptTokens: data.usage.input_tokens,
      completionTokens: data.usage.output_tokens,
      totalTokens: data.usage.input_tokens + data.usage.output_tokens,
    },
  };
}

/**
 * AI Service - Handles AI API calls
 */
export class AIService {
  /**
   * Execute an AI request
   */
  static async execute(request: AIRequest): Promise<AIResponse> {
    const { prompt, model, maxTokens, temperature, apiKey, provider } = request;

    switch (provider) {
      case 'openai':
        return callOpenAI(apiKey, prompt, model, maxTokens, temperature);
      case 'anthropic':
        return callAnthropic(apiKey, prompt, model, maxTokens, temperature);
      default:
        throw new Error(`Unsupported provider: ${provider}`);
    }
  }

  /**
   * Simulate an AI response (for demo without API key)
   */
  static async simulate(prompt: string, model: string): Promise<AIResponse> {
    // Simulate processing delay
    await new Promise(resolve => setTimeout(resolve, 1500));

    const responses = [
      `This is a simulated response from the PrivateAI Gateway. In production, your prompt "${prompt.substring(0, 50)}..." would be processed securely inside a Trusted Execution Environment (TEE), ensuring complete privacy.`,
      `🔐 **Simulated Private AI Response**\n\nYour question: "${prompt.substring(0, 50)}..."\n\nIn a real deployment, this response would come from ${model} via iExec's confidential computing infrastructure. Neither the platform operators nor compute providers can access your data.`,
      `[Demo Mode] Processing your request privately...\n\nThe PrivateAI Gateway ensures:\n- End-to-end encryption\n- TEE-based processing\n- Zero-knowledge architecture\n\nYour prompt would be answered by ${model} in production.`,
    ];

    const content = responses[Math.floor(Math.random() * responses.length)];

    return {
      content,
      model: `${model} (simulated)`,
      usage: {
        promptTokens: Math.floor(prompt.length / 4),
        completionTokens: Math.floor(content.length / 4),
        totalTokens: Math.floor((prompt.length + content.length) / 4),
      },
    };
  }
}

/**
 * Crypto utilities for session encryption
 */
export class CryptoService {
  /**
   * Generate a session key
   */
  static generateSessionKey(): { key: string; iv: string } {
    return {
      key: randomBytes(32).toString('hex'),
      iv: randomBytes(16).toString('hex'),
    };
  }

  /**
   * Encrypt data with session key
   */
  static encrypt(data: string, sessionKey: { key: string; iv: string }): string {
    const key = Buffer.from(sessionKey.key, 'hex');
    const iv = Buffer.from(sessionKey.iv, 'hex');
    
    const cipher = createCipheriv('aes-256-cbc', key, iv);
    let encrypted = cipher.update(data, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    return encrypted;
  }

  /**
   * Decrypt data with session key
   */
  static decrypt(encryptedData: string, sessionKey: { key: string; iv: string }): string {
    const key = Buffer.from(sessionKey.key, 'hex');
    const iv = Buffer.from(sessionKey.iv, 'hex');
    
    const decipher = createDecipheriv('aes-256-cbc', key, iv);
    let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }

  /**
   * Hash a value
   */
  static hash(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }
}
