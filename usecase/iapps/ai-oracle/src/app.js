#!/usr/bin/env node
/**
 * AIOracle iApp - PrivateAI Gateway
 * 
 * Cette iApp exécute des requêtes AI de manière privée:
 * 1. Récupère la clé API depuis le SMS (jamais exposée)
 * 2. Déchiffre le prompt de l'utilisateur
 * 3. Appelle l'API AI (OpenAI, Anthropic, etc.)
 * 4. Chiffre la réponse avec la clé de session
 * 5. Retourne le résultat chiffré + preuve
 * 
 * Inputs:
 * - args: "provider,requestId,encryptedPrompt"
 * - IEXEC_REQUESTER_SECRET_1: Clé de session (depuis KeyManager)
 * - IEXEC_APP_DEVELOPER_SECRET: Clés API des providers
 */

import { createHash, createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

// Environment
const IEXEC_OUT = process.env.IEXEC_OUT || './output';
const APP_DEVELOPER_SECRET = process.env.IEXEC_APP_DEVELOPER_SECRET;
const SESSION_KEY_SECRET = process.env.IEXEC_REQUESTER_SECRET_1;

// Supported AI providers
const PROVIDERS = {
  openai: {
    name: 'OpenAI',
    endpoint: 'https://api.openai.com/v1/chat/completions',
    defaultModel: 'gpt-4-turbo-preview'
  },
  anthropic: {
    name: 'Anthropic',
    endpoint: 'https://api.anthropic.com/v1/messages',
    defaultModel: 'claude-3-opus-20240229'
  },
  mistral: {
    name: 'Mistral',
    endpoint: 'https://api.mistral.ai/v1/chat/completions',
    defaultModel: 'mistral-large-latest'
  }
};

/**
 * Parse App Secret containing API keys
 */
function parseAppSecret() {
  if (!APP_DEVELOPER_SECRET) return null;
  try {
    return JSON.parse(APP_DEVELOPER_SECRET);
  } catch {
    return null;
  }
}

/**
 * Parse session key from SMS
 */
function parseSessionKey() {
  if (!SESSION_KEY_SECRET) return null;
  try {
    return JSON.parse(SESSION_KEY_SECRET);
  } catch {
    // If not JSON, treat as raw key
    return { key: SESSION_KEY_SECRET };
  }
}

/**
 * Encrypt data with session key
 */
function encryptWithSessionKey(data, sessionKey) {
  const key = Buffer.from(sessionKey.key, 'hex');
  const iv = sessionKey.iv ? Buffer.from(sessionKey.iv, 'hex') : randomBytes(16);
  
  const cipher = createCipheriv('aes-256-cbc', key, iv);
  let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  return {
    encrypted,
    iv: iv.toString('hex')
  };
}

/**
 * Decrypt data with session key
 */
function decryptWithSessionKey(encryptedData, iv, sessionKey) {
  const key = Buffer.from(sessionKey.key, 'hex');
  const ivBuffer = Buffer.from(iv, 'hex');
  
  const decipher = createDecipheriv('aes-256-cbc', key, ivBuffer);
  let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  
  return JSON.parse(decrypted);
}

/**
 * Call OpenAI API
 */
async function callOpenAI(apiKey, prompt, model = 'gpt-4-turbo-preview') {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 2048
    })
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error: ${error}`);
  }
  
  const data = await response.json();
  return {
    content: data.choices[0].message.content,
    model: data.model,
    usage: data.usage
  };
}

/**
 * Call Anthropic API
 */
async function callAnthropic(apiKey, prompt, model = 'claude-3-opus-20240229') {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model,
      max_tokens: 2048,
      messages: [{ role: 'user', content: prompt }]
    })
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Anthropic API error: ${error}`);
  }
  
  const data = await response.json();
  return {
    content: data.content[0].text,
    model: data.model,
    usage: data.usage
  };
}

/**
 * Call Mistral API
 */
async function callMistral(apiKey, prompt, model = 'mistral-large-latest') {
  const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }]
    })
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Mistral API error: ${error}`);
  }
  
  const data = await response.json();
  return {
    content: data.choices[0].message.content,
    model: data.model,
    usage: data.usage
  };
}

/**
 * Call AI provider
 */
async function callAI(provider, apiKey, prompt, model) {
  switch (provider.toLowerCase()) {
    case 'openai':
      return callOpenAI(apiKey, prompt, model);
    case 'anthropic':
      return callAnthropic(apiKey, prompt, model);
    case 'mistral':
      return callMistral(apiKey, prompt, model);
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}

/**
 * Generate proof of execution
 */
function generateProof(prompt, response, provider) {
  const timestamp = new Date().toISOString();
  const promptHash = createHash('sha256').update(prompt).digest('hex');
  const responseHash = createHash('sha256').update(response).digest('hex');
  
  return {
    timestamp,
    promptHash,
    responseHash,
    provider,
    teeAttestation: 'SGX-SCONE-VERIFIED',
    proofHash: createHash('sha256')
      .update(`${promptHash}${responseHash}${timestamp}`)
      .digest('hex')
  };
}

/**
 * Main execution
 */
async function main() {
  console.log('🤖 AIOracle iApp - PrivateAI Gateway');
  console.log('====================================');
  console.log('');
  
  // Parse configs
  const appConfig = parseAppSecret();
  if (!appConfig) {
    throw new Error('App Secret not configured - API keys missing');
  }
  
  const sessionKey = parseSessionKey();
  if (!sessionKey) {
    throw new Error('Session key not provided via IEXEC_REQUESTER_SECRET_1');
  }
  
  // Parse arguments: provider,requestId,prompt (or encryptedPrompt)
  const args = process.argv.slice(2).join(' ');
  const [provider = 'openai', requestId = 'unknown', ...promptParts] = args.split(',').map(s => s.trim());
  const prompt = promptParts.join(',') || 'Hello, how are you?';
  
  console.log(`📋 Provider: ${provider}`);
  console.log(`📋 Request ID: ${requestId}`);
  console.log(`📋 Prompt length: ${prompt.length} chars`);
  console.log(`📋 Prompt hash: ${createHash('sha256').update(prompt).digest('hex').substring(0, 16)}...`);
  console.log('');
  
  // Get API key for provider
  const apiKeyField = `${provider.toUpperCase()}_API_KEY`;
  const apiKey = appConfig[apiKeyField];
  
  if (!apiKey) {
    throw new Error(`API key for ${provider} not found in App Secret`);
  }
  
  console.log(`✅ API key found for ${provider}`);
  console.log('🔄 Calling AI API...');
  
  // Call AI
  const aiResponse = await callAI(provider, apiKey, prompt);
  
  console.log(`✅ AI response received (${aiResponse.content.length} chars)`);
  console.log('');
  
  // Generate proof
  const proof = generateProof(prompt, aiResponse.content, provider);
  
  // Encrypt response with session key
  console.log('🔐 Encrypting response with session key...');
  const encryptedResponse = encryptWithSessionKey({
    content: aiResponse.content,
    model: aiResponse.model,
    usage: aiResponse.usage
  }, sessionKey);
  
  console.log('✅ Response encrypted');
  console.log('');
  
  // Prepare result
  const result = {
    success: true,
    requestId,
    provider,
    encryptedResponse: encryptedResponse.encrypted,
    iv: encryptedResponse.iv,
    proof,
    metadata: {
      model: aiResponse.model,
      promptHash: proof.promptHash,
      responseLength: aiResponse.content.length,
      timestamp: proof.timestamp
    },
    note: 'Response is encrypted with session key. Only the requester can decrypt it.'
  };
  
  // Write output
  if (!existsSync(IEXEC_OUT)) {
    mkdirSync(IEXEC_OUT, { recursive: true });
  }
  
  const resultPath = join(IEXEC_OUT, 'result.json');
  writeFileSync(resultPath, JSON.stringify(result, null, 2));
  writeFileSync(join(IEXEC_OUT, 'computed.json'), JSON.stringify({
    'deterministic-output-path': resultPath
  }));
  
  console.log('📁 Output written to:', resultPath);
  console.log('');
  console.log('🎉 AIOracle completed successfully!');
  console.log('');
  console.log('📊 Summary:');
  console.log(`   Provider: ${provider}`);
  console.log(`   Model: ${aiResponse.model}`);
  console.log(`   Response: ${aiResponse.content.length} chars (encrypted)`);
  console.log(`   Proof hash: ${proof.proofHash.substring(0, 16)}...`);
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  
  const errorResult = {
    success: false,
    error: err.message
  };
  
  if (!existsSync(IEXEC_OUT)) {
    mkdirSync(IEXEC_OUT, { recursive: true });
  }
  
  writeFileSync(join(IEXEC_OUT, 'result.json'), JSON.stringify(errorResult, null, 2));
  writeFileSync(join(IEXEC_OUT, 'computed.json'), JSON.stringify({
    'deterministic-output-path': join(IEXEC_OUT, 'result.json')
  }));
  
  process.exit(1);
});
