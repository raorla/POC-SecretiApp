#!/usr/bin/env node
/**
 * KeyManager iApp - PrivateAI Gateway
 * 
 * Cette iApp gère les clés API de manière sécurisée:
 * 1. Génère des clés de session uniques pour chaque requête
 * 2. Stocke les clés API des providers (OpenAI, Anthropic) dans le SMS
 * 3. Permet le partage sécurisé de clés entre utilisateurs
 * 
 * Actions:
 * - generate-session: Génère une clé de session pour une requête
 * - rotate-api-key: Rotate une clé API provider
 * - check-key: Vérifie si une clé existe
 */

import { randomBytes, createHash, createCipheriv, createDecipheriv } from 'crypto';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { IExec, utils } from 'iexec';

// Environment variables
const IEXEC_OUT = process.env.IEXEC_OUT || './output';
const APP_DEVELOPER_SECRET = process.env.IEXEC_APP_DEVELOPER_SECRET;
const REQUESTER_SECRET = process.env.IEXEC_REQUESTER_SECRET_1;

// iExec Config
const SMS_URL = 'https://sms.arbitrum-sepolia-testnet.iex.ec';
const RPC_URL = 'https://sepolia-rollup.arbitrum.io/rpc';
const CHAIN_ID = 421614;

/**
 * Generate a secure session key
 */
function generateSessionKey() {
  return {
    key: randomBytes(32).toString('hex'),
    iv: randomBytes(16).toString('hex'),
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 3600000).toISOString() // 1 hour
  };
}

/**
 * Generate an encryption key pair for a user
 */
function generateUserKeyPair() {
  const privateKey = randomBytes(32).toString('hex');
  const publicKeyHash = createHash('sha256').update(privateKey).digest('hex');
  
  return {
    privateKey,
    publicKeyHash,
    createdAt: new Date().toISOString()
  };
}

/**
 * Hash a key for verification without exposing it
 */
function hashKey(key) {
  return createHash('sha256').update(key).digest('hex');
}

/**
 * Parse App Secret
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
 * Push secret to SMS
 */
async function pushToSMS(secretName, secretValue, privateKey) {
  const ethProvider = utils.getSignerFromPrivateKey(RPC_URL, privateKey);
  const iexec = new IExec({ ethProvider }, { chainId: CHAIN_ID, smsURL: SMS_URL });
  
  const address = await iexec.wallet.getAddress();
  
  // Check if exists
  const exists = await iexec.secrets.checkRequesterSecretExists(address, secretName);
  if (exists) {
    // Add timestamp for uniqueness
    secretName = `${secretName}-${Date.now()}`;
  }
  
  const result = await iexec.secrets.pushRequesterSecret(secretName, secretValue);
  
  return {
    success: result.isPushed,
    secretName,
    address
  };
}

/**
 * Main execution
 */
async function main() {
  console.log('🔑 KeyManager iApp - PrivateAI Gateway');
  console.log('======================================');
  console.log('');
  
  const appConfig = parseAppSecret();
  if (!appConfig?.DEDICATED_PRIVATE_KEY) {
    throw new Error('App Secret not configured');
  }
  
  // Parse arguments
  const args = process.argv.slice(2).join(' ').split(',').map(s => s.trim());
  const action = args[0] || 'generate-session';
  const requestId = args[1] || `req-${Date.now()}`;
  const userId = args[2] || 'default';
  
  console.log(`📋 Action: ${action}`);
  console.log(`📋 Request ID: ${requestId}`);
  console.log(`📋 User ID: ${userId}`);
  console.log('');
  
  let result = {};
  
  switch (action) {
    case 'generate-session': {
      console.log('🔐 Generating session key...');
      
      const sessionKey = generateSessionKey();
      const sessionSecretName = `session-${requestId}`;
      
      // Push session key to SMS
      const pushResult = await pushToSMS(
        sessionSecretName,
        JSON.stringify(sessionKey),
        appConfig.DEDICATED_PRIVATE_KEY
      );
      
      console.log(`✅ Session key generated and pushed to SMS`);
      
      result = {
        success: true,
        action: 'generate-session',
        requestId,
        sessionInfo: {
          secretName: pushResult.secretName,
          keyHash: hashKey(sessionKey.key),
          expiresAt: sessionKey.expiresAt
        },
        dedicatedAddress: pushResult.address
      };
      break;
    }
    
    case 'generate-user-keys': {
      console.log('🔐 Generating user encryption keys...');
      
      const keyPair = generateUserKeyPair();
      const userSecretName = `user-keys-${userId}`;
      
      // Push private key to SMS (only user can access)
      const pushResult = await pushToSMS(
        userSecretName,
        keyPair.privateKey,
        appConfig.DEDICATED_PRIVATE_KEY
      );
      
      console.log(`✅ User keys generated`);
      
      result = {
        success: true,
        action: 'generate-user-keys',
        userId,
        keyInfo: {
          secretName: pushResult.secretName,
          publicKeyHash: keyPair.publicKeyHash,
          createdAt: keyPair.createdAt
        },
        dedicatedAddress: pushResult.address,
        note: 'Private key stored in SMS, public hash returned for verification'
      };
      break;
    }
    
    case 'store-api-key': {
      console.log('🔐 Storing API key securely...');
      
      // The API key should come from requester secret
      if (!REQUESTER_SECRET) {
        throw new Error('API key must be provided via IEXEC_REQUESTER_SECRET_1');
      }
      
      const provider = args[1] || 'openai';
      const apiKeySecretName = `api-key-${provider}-${userId}`;
      
      const pushResult = await pushToSMS(
        apiKeySecretName,
        REQUESTER_SECRET,
        appConfig.DEDICATED_PRIVATE_KEY
      );
      
      console.log(`✅ API key stored for ${provider}`);
      
      result = {
        success: true,
        action: 'store-api-key',
        provider,
        userId,
        keyInfo: {
          secretName: pushResult.secretName,
          keyHash: hashKey(REQUESTER_SECRET),
          storedAt: new Date().toISOString()
        },
        dedicatedAddress: pushResult.address
      };
      break;
    }
    
    default:
      throw new Error(`Unknown action: ${action}`);
  }
  
  // Write output
  if (!existsSync(IEXEC_OUT)) {
    mkdirSync(IEXEC_OUT, { recursive: true });
  }
  
  const resultPath = join(IEXEC_OUT, 'result.json');
  writeFileSync(resultPath, JSON.stringify(result, null, 2));
  writeFileSync(join(IEXEC_OUT, 'computed.json'), JSON.stringify({
    'deterministic-output-path': resultPath
  }));
  
  console.log('');
  console.log('📁 Output written to:', resultPath);
  console.log('🎉 KeyManager completed successfully!');
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
