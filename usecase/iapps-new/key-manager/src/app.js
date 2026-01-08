import fs from 'node:fs/promises';
import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';

/**
 * KeyManager iApp - PrivateAI Gateway
 * 
 * Gère les clés de session de manière sécurisée dans un TEE.
 * 
 * Actions:
 * - generate-session: Génère une nouvelle clé de session
 * - encrypt: Chiffre des données avec une clé de session
 * - decrypt: Déchiffre des données avec une clé de session
 * 
 * Inputs:
 * - args[0]: action (generate-session, encrypt, decrypt)
 * - args[1]: sessionId
 * - args[2]: expiresAt (timestamp)
 * - IEXEC_REQUESTER_SECRET_1: API Key de l'utilisateur (pour generate-session)
 * - IEXEC_REQUESTER_SECRET_2: Données à chiffrer/déchiffrer (pour encrypt/decrypt)
 */

/**
 * Génère une clé de session sécurisée
 */
function generateSessionKey() {
  return {
    key: randomBytes(32).toString('hex'),
    iv: randomBytes(16).toString('hex'),
    createdAt: new Date().toISOString()
  };
}

/**
 * Chiffre des données avec AES-256-CBC
 */
function encrypt(data, key, iv) {
  const keyBuffer = Buffer.from(key, 'hex');
  const ivBuffer = Buffer.from(iv, 'hex');
  
  const cipher = createCipheriv('aes-256-cbc', keyBuffer, ivBuffer);
  let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  return encrypted;
}

/**
 * Déchiffre des données avec AES-256-CBC
 */
function decrypt(encryptedData, key, iv) {
  const keyBuffer = Buffer.from(key, 'hex');
  const ivBuffer = Buffer.from(iv, 'hex');
  
  const decipher = createDecipheriv('aes-256-cbc', keyBuffer, ivBuffer);
  let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  
  return JSON.parse(decrypted);
}

const main = async () => {
  const { IEXEC_OUT } = process.env;
  let computedJsonObj = {};

  try {
    console.log('🔑 KeyManager starting...');
    
    // Parse arguments
    const args = process.argv.slice(2);
    const action = args[0] || 'generate-session';
    const sessionId = args[1] || `session-${Date.now()}`;
    const expiresAt = args[2] || new Date(Date.now() + 3600000).toISOString(); // 1 hour default
    
    console.log(`Action: ${action}`);
    console.log(`Session ID: ${sessionId}`);
    console.log(`Expires At: ${expiresAt}`);

    let result;

    switch (action) {
      case 'generate-session': {
        // Get the API key from requester secret
        const apiKey = process.env.IEXEC_REQUESTER_SECRET_1;
        
        if (!apiKey) {
          throw new Error('No API key provided (IEXEC_REQUESTER_SECRET_1 is required)');
        }
        
        console.log(`API key received (${apiKey.length} chars)`);
        
        // Generate session key
        const sessionKey = generateSessionKey();
        console.log('Session key generated');
        
        // Encrypt the API key with the session key
        const encryptedApiKey = encrypt(
          { apiKey, sessionId, expiresAt },
          sessionKey.key,
          sessionKey.iv
        );
        console.log('API key encrypted');
        
        result = {
          success: true,
          action: 'generate-session',
          sessionId,
          sessionKey: {
            key: sessionKey.key,
            iv: sessionKey.iv
          },
          encryptedApiKey,
          expiresAt,
          createdAt: sessionKey.createdAt
        };
        break;
      }

      case 'encrypt': {
        const dataToEncrypt = process.env.IEXEC_REQUESTER_SECRET_2;
        const keyData = process.env.IEXEC_REQUESTER_SECRET_1;
        
        if (!dataToEncrypt || !keyData) {
          throw new Error('Missing secrets for encryption');
        }
        
        const { key, iv } = JSON.parse(keyData);
        const encrypted = encrypt(dataToEncrypt, key, iv);
        
        result = {
          success: true,
          action: 'encrypt',
          sessionId,
          encrypted
        };
        break;
      }

      case 'decrypt': {
        const encryptedData = process.env.IEXEC_REQUESTER_SECRET_2;
        const keyData = process.env.IEXEC_REQUESTER_SECRET_1;
        
        if (!encryptedData || !keyData) {
          throw new Error('Missing secrets for decryption');
        }
        
        const { key, iv } = JSON.parse(keyData);
        const decrypted = decrypt(encryptedData, key, iv);
        
        result = {
          success: true,
          action: 'decrypt',
          sessionId,
          decrypted
        };
        break;
      }

      default:
        throw new Error(`Unknown action: ${action}`);
    }

    // Write result
    await fs.writeFile(`${IEXEC_OUT}/result.json`, JSON.stringify(result, null, 2));
    
    computedJsonObj = {
      'deterministic-output-path': `${IEXEC_OUT}/result.json`,
    };

    console.log(`✅ KeyManager completed: ${action}`);

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
