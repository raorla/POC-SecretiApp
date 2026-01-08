import fs from 'node:fs/promises';
import crypto from 'node:crypto';

/**
 * PrivateAI Oracle - iExec TEE Application
 * 
 * Exécute des requêtes AI de manière privée dans un TEE.
 * La clé API est déchiffrée dans le TEE pour une sécurité maximale.
 * 
 * Inputs:
 * - args[0]: provider (openai, anthropic, mistral)
 * - args[1]: model (gpt-4, claude-3-opus, etc.)
 * - args[2]: maxTokens
 * - IEXEC_REQUESTER_SECRET_1: Le prompt (secret)
 * - IEXEC_REQUESTER_SECRET_2: JSON avec sessionKey et iv pour déchiffrement
 * - IEXEC_REQUESTER_SECRET_3: La clé API chiffrée (hex)
 */

/**
 * Déchiffre une clé API avec AES-256-CBC
 */
function decryptApiKey(encryptedHex, keyHex, ivHex) {
  const key = Buffer.from(keyHex, 'hex');
  const iv = Buffer.from(ivHex, 'hex');
  const encrypted = Buffer.from(encryptedHex, 'hex');
  
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  let decrypted = decipher.update(encrypted);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  
  return decrypted.toString('utf8');
}

const PROVIDERS = {
  openai: {
    endpoint: 'https://api.openai.com/v1/chat/completions',
    defaultModel: 'gpt-4o-mini'
  },
  anthropic: {
    endpoint: 'https://api.anthropic.com/v1/messages',
    defaultModel: 'claude-3-opus-20240229'
  },
  mistral: {
    endpoint: 'https://api.mistral.ai/v1/chat/completions',
    defaultModel: 'mistral-large-latest'
  }
};

async function callOpenAI(apiKey, prompt, model, maxTokens) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: model || 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: parseInt(maxTokens) || 1024
    })
  });
  
  if (!response.ok) {
    throw new Error(`OpenAI API error: ${await response.text()}`);
  }
  
  const data = await response.json();
  return {
    content: data.choices[0].message.content,
    model: data.model,
    usage: data.usage
  };
}

async function callAnthropic(apiKey, prompt, model, maxTokens) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: model || 'claude-3-opus-20240229',
      max_tokens: parseInt(maxTokens) || 1024,
      messages: [{ role: 'user', content: prompt }]
    })
  });
  
  if (!response.ok) {
    throw new Error(`Anthropic API error: ${await response.text()}`);
  }
  
  const data = await response.json();
  return {
    content: data.content[0].text,
    model: data.model,
    usage: data.usage
  };
}

async function callMistral(apiKey, prompt, model, maxTokens) {
  const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: model || 'mistral-large-latest',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: parseInt(maxTokens) || 1024
    })
  });
  
  if (!response.ok) {
    throw new Error(`Mistral API error: ${await response.text()}`);
  }
  
  const data = await response.json();
  return {
    content: data.choices[0].message.content,
    model: data.model,
    usage: data.usage
  };
}

const main = async () => {
  const { IEXEC_OUT } = process.env;
  let computedJsonObj = {};

  try {
    console.log('🤖 PrivateAI Oracle starting...');
    
    // Parse arguments: provider, model, maxTokens
    const args = process.argv.slice(2);
    const provider = args[0] || 'openai';
    const model = args[1] || '';
    const maxTokens = args[2] || '1024';
    
    console.log(`Provider: ${provider}`);
    console.log(`Model: ${model || 'default'}`);
    console.log(`Max Tokens: ${maxTokens}`);

    // Get the prompt from requester secret
    const prompt = process.env.IEXEC_REQUESTER_SECRET_1;
    if (!prompt) {
      throw new Error('No prompt provided (IEXEC_REQUESTER_SECRET_1 is required)');
    }
    console.log(`Prompt received (${prompt.length} chars)`);

    // Get session key info from requester secret 2 (JSON with key and iv)
    const sessionKeyJson = process.env.IEXEC_REQUESTER_SECRET_2;
    // Get encrypted API key from requester secret 3
    const encryptedApiKey = process.env.IEXEC_REQUESTER_SECRET_3;
    
    let apiKey;
    
    // If we have session key + encrypted API key, decrypt it
    if (sessionKeyJson && encryptedApiKey) {
      console.log('Decrypting API key using session key...');
      try {
        const sessionData = JSON.parse(sessionKeyJson);
        const decryptedJson = decryptApiKey(encryptedApiKey, sessionData.key, sessionData.iv);
        
        // The KeyManager encrypts { apiKey, sessionId, expiresAt } - we need to parse and extract apiKey
        const decryptedData = JSON.parse(decryptedJson);
        apiKey = decryptedData.apiKey;
        
        console.log(`API key decrypted successfully (${apiKey.substring(0, 10)}...)`);
      } catch (err) {
        throw new Error(`Failed to decrypt API key: ${err.message}`);
      }
    } else if (process.env.IEXEC_REQUESTER_SECRET_2 && !encryptedApiKey) {
      // Fallback: secret 2 is the API key directly (for backward compatibility)
      apiKey = process.env.IEXEC_REQUESTER_SECRET_2;
      console.log(`API key provided directly (${apiKey.substring(0, 10)}...)`);
    } else {
      // Fallback to app developer secret
      const appSecret = process.env.IEXEC_APP_DEVELOPER_SECRET;
      if (appSecret) {
        try {
          const apiKeys = JSON.parse(appSecret);
          apiKey = apiKeys[provider];
        } catch {
          console.log('App secret not valid JSON, trying as direct key');
          apiKey = appSecret;
        }
      }
    }
    
    if (!apiKey) {
      throw new Error(`No API key found for provider: ${provider}. Provide it in IEXEC_REQUESTER_SECRET_2 or configure IEXEC_APP_DEVELOPER_SECRET`);
    }
    console.log(`API key found for ${provider} (${apiKey.substring(0, 10)}...)`);

    // Call the AI provider
    let result;
    console.log(`Calling ${provider} API...`);
    
    switch (provider.toLowerCase()) {
      case 'openai':
        result = await callOpenAI(apiKey, prompt, model, maxTokens);
        break;
      case 'anthropic':
        result = await callAnthropic(apiKey, prompt, model, maxTokens);
        break;
      case 'mistral':
        result = await callMistral(apiKey, prompt, model, maxTokens);
        break;
      default:
        throw new Error(`Unsupported provider: ${provider}`);
    }

    console.log(`Response received (${result.content.length} chars)`);
    console.log(`Model used: ${result.model}`);
    if (result.usage) {
      console.log(`Tokens: ${JSON.stringify(result.usage)}`);
    }

    // Prepare output
    const output = {
      success: true,
      provider,
      model: result.model,
      response: result.content,
      usage: result.usage,
      timestamp: new Date().toISOString()
    };

    // Write result
    await fs.writeFile(`${IEXEC_OUT}/result.json`, JSON.stringify(output, null, 2));
    
    computedJsonObj = {
      'deterministic-output-path': `${IEXEC_OUT}/result.json`,
    };

    console.log('✅ PrivateAI Oracle completed successfully');

  } catch (e) {
    console.error('❌ Error:', e.message);
    
    const errorOutput = {
      success: false,
      error: e.message,
      timestamp: new Date().toISOString()
    };
    
    await fs.writeFile(`${IEXEC_OUT}/result.json`, JSON.stringify(errorOutput, null, 2));
    
    computedJsonObj = {
      'deterministic-output-path': `${IEXEC_OUT}/result.json`,
    };
  }

  // Write computed.json for iExec
  await fs.writeFile(
    `${IEXEC_OUT}/computed.json`,
    JSON.stringify(computedJsonObj)
  );
};

main();
