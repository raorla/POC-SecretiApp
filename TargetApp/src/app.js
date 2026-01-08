#!/usr/bin/env node

/**
 * Secret Generator iApp for iExec - AUTO PUSH VERSION
 * 
 * This iApp generates secure secrets and AUTOMATICALLY pushes them to the 
 * Secret Management Service (SMS) using a dedicated private key stored in App Secret.
 * 
 * The secret is pushed to SMS and can be consumed by ConsumeApp without
 * anyone (developer or user) ever seeing the secret value.
 * 
 * Usage:
 *   args: "secretName,secretType"
 *   - secretName: Name to identify the secret in SMS
 *   - secretType: Type of secret (api-key, password, token, random, uuid)
 */

import { randomBytes, createHash } from 'crypto';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { IExec, utils } from 'iexec';

// Environment variables provided by iExec TEE
const IEXEC_OUT = process.env.IEXEC_OUT || './output';
const APP_DEVELOPER_SECRET = process.env.IEXEC_APP_DEVELOPER_SECRET;

// Default SMS URL for Arbitrum Sepolia
const DEFAULT_SMS_URL = 'https://sms.arbitrum-sepolia-testnet.iex.ec';
const DEFAULT_RPC_URL = 'https://sepolia-rollup.arbitrum.io/rpc';
const CHAIN_ID = 421614;

/**
 * Generate a secure random string
 */
function generateRandomString(length, charset = 'alphanumeric') {
    const charsets = {
        alphanumeric: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789',
        alphanumericSpecial: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+-=[]{}|;:,.<>?',
        hex: '0123456789abcdef',
        numeric: '0123456789',
        alpha: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
    };
    
    const chars = charsets[charset] || charsets.alphanumeric;
    const bytes = randomBytes(length);
    let result = '';
    
    for (let i = 0; i < length; i++) {
        result += chars[bytes[i] % chars.length];
    }
    
    return result;
}

/**
 * Generate a UUID v4
 */
function generateUUID() {
    const bytes = randomBytes(16);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    
    const hex = bytes.toString('hex');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Generate secret based on type
 */
function generateSecret(secretType) {
    const timestamp = new Date().toISOString();
    let secretValue;
    let metadata = {};
    
    switch (secretType.toLowerCase()) {
        case 'api-key':
            const prefix = generateRandomString(4, 'alpha').toLowerCase();
            const key = generateRandomString(32, 'alphanumeric');
            secretValue = `${prefix}_${key}`;
            metadata = { format: 'prefix_key', keyLength: 32 };
            break;
            
        case 'password':
            secretValue = generateRandomString(24, 'alphanumericSpecial');
            metadata = { format: 'strong_password', length: 24, hasSpecialChars: true };
            break;
            
        case 'token':
            const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
            const payload = Buffer.from(JSON.stringify({
                iat: Math.floor(Date.now() / 1000),
                jti: generateUUID()
            })).toString('base64url');
            const signature = randomBytes(32).toString('base64url');
            secretValue = `${header}.${payload}.${signature}`;
            metadata = { format: 'jwt-like' };
            break;
            
        case 'uuid':
            secretValue = generateUUID();
            metadata = { format: 'uuid-v4' };
            break;
            
        case 'hex':
            secretValue = randomBytes(32).toString('hex');
            metadata = { format: 'hex', bits: 256 };
            break;
            
        case 'private-key':
            secretValue = '0x' + randomBytes(32).toString('hex');
            metadata = { format: 'ethereum-compatible', bits: 256 };
            break;
            
        case 'random':
        default:
            secretValue = randomBytes(32).toString('base64');
            metadata = { format: 'base64', bytes: 32 };
            break;
    }
    
    const secretHash = createHash('sha256').update(secretValue).digest('hex');
    
    return {
        secret: secretValue,
        hash: secretHash,
        type: secretType,
        generatedAt: timestamp,
        metadata
    };
}

/**
 * Parse App Secret configuration
 */
function parseAppSecret() {
    if (!APP_DEVELOPER_SECRET) {
        return null;
    }
    
    try {
        const config = JSON.parse(APP_DEVELOPER_SECRET);
        return {
            privateKey: config.DEDICATED_PRIVATE_KEY,
            smsUrl: config.SMS_URL || DEFAULT_SMS_URL,
            rpcUrl: config.RPC_URL || DEFAULT_RPC_URL
        };
    } catch (error) {
        console.error('❌ Failed to parse App Secret:', error.message);
        return null;
    }
}

/**
 * Push secret to SMS using dedicated private key
 */
async function pushSecretToSMS(secretName, secretValue, config) {
    console.log('📤 Pushing secret to SMS...');
    console.log(`   SMS URL: ${config.smsUrl}`);
    
    try {
        // Create ethProvider from private key
        const ethProvider = utils.getSignerFromPrivateKey(
            config.rpcUrl,
            config.privateKey
        );
        
        // Initialize iExec SDK
        const iexec = new IExec(
            { ethProvider },
            {
                chainId: CHAIN_ID,
                smsURL: config.smsUrl
            }
        );
        
        // Get the address associated with the private key
        const address = await iexec.wallet.getAddress();
        console.log(`   Dedicated Address: ${address}`);
        
        // Check if secret already exists
        const exists = await iexec.secrets.checkRequesterSecretExists(address, secretName);
        
        if (exists) {
            // Add timestamp to make unique name
            const uniqueName = `${secretName}-${Date.now()}`;
            console.log(`   ⚠️ Secret "${secretName}" already exists, using "${uniqueName}"`);
            
            const result = await iexec.secrets.pushRequesterSecret(uniqueName, secretValue);
            
            return {
                success: result.isPushed,
                secretName: uniqueName,
                address,
                note: 'Original name was taken, used timestamped name'
            };
        }
        
        // Push the secret
        const result = await iexec.secrets.pushRequesterSecret(secretName, secretValue);
        
        console.log(`   ✅ Secret pushed successfully!`);
        
        return {
            success: result.isPushed,
            secretName,
            address
        };
        
    } catch (error) {
        console.error(`   ❌ Failed to push secret: ${error.message}`);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Parse command line arguments
 */
function parseArgs(args) {
    const argString = args.join(' ').trim();
    
    if (!argString) {
        return {
            secretName: `secret-${Date.now()}`,
            secretType: 'random'
        };
    }
    
    const parts = argString.split(',').map(p => p.trim());
    
    return {
        secretName: parts[0] || `secret-${Date.now()}`,
        secretType: parts[1] || 'random'
    };
}

/**
 * Main function
 */
async function main() {
    console.log('🔐 Secret Generator iApp - AUTO PUSH');
    console.log('=====================================');
    console.log('Running inside iExec TEE environment');
    console.log('');
    
    // Parse App Secret configuration
    const appConfig = parseAppSecret();
    
    if (!appConfig || !appConfig.privateKey) {
        console.error('❌ No App Secret configured!');
        console.error('');
        console.error('📌 This iApp requires an App Secret with:');
        console.error('   {');
        console.error('     "DEDICATED_PRIVATE_KEY": "0x...",');
        console.error('     "SMS_URL": "https://sms..."');
        console.error('   }');
        
        const output = {
            success: false,
            error: 'App Secret not configured',
            instructions: 'Deploy this iApp with an App Secret containing DEDICATED_PRIVATE_KEY'
        };
        
        if (!existsSync(IEXEC_OUT)) mkdirSync(IEXEC_OUT, { recursive: true });
        writeFileSync(join(IEXEC_OUT, 'result.json'), JSON.stringify(output, null, 2));
        writeFileSync(join(IEXEC_OUT, 'computed.json'), JSON.stringify({ 'deterministic-output-path': join(IEXEC_OUT, 'result.json') }));
        
        return;
    }
    
    console.log('✅ App Secret found');
    console.log('');
    
    // Parse arguments
    const args = process.argv.slice(2);
    const { secretName, secretType } = parseArgs(args);
    
    console.log(`📋 Configuration:`);
    console.log(`   Secret Name: ${secretName}`);
    console.log(`   Secret Type: ${secretType}`);
    console.log('');
    
    // Generate the secret
    console.log('🎲 Generating secret...');
    const secretData = generateSecret(secretType);
    
    console.log(`✅ Secret generated!`);
    console.log(`   Type: ${secretData.type}`);
    console.log(`   Hash (SHA-256): ${secretData.hash}`);
    console.log('');
    
    // Push secret to SMS
    const pushResult = await pushSecretToSMS(secretName, secretData.secret, appConfig);
    
    // Prepare output (never expose the secret value!)
    const output = {
        success: pushResult.success,
        secretName: pushResult.secretName || secretName,
        dedicatedAddress: pushResult.address,
        secretInfo: {
            hash: secretData.hash,
            type: secretData.type,
            generatedAt: secretData.generatedAt,
            metadata: secretData.metadata
        },
        smsInfo: {
            pushed: pushResult.success,
            error: pushResult.error || null
        },
        consumeInstructions: {
            description: 'To use this secret in ConsumeApp:',
            requesterAddress: pushResult.address,
            secretName: pushResult.secretName || secretName,
            note: 'The secret value is NEVER exposed - it went directly from TEE to SMS'
        }
    };
    
    // Ensure output directory exists
    if (!existsSync(IEXEC_OUT)) {
        mkdirSync(IEXEC_OUT, { recursive: true });
    }
    
    // Write the result
    const resultPath = join(IEXEC_OUT, 'result.json');
    writeFileSync(resultPath, JSON.stringify(output, null, 2));
    
    // Write computed.json for iExec
    const computedPath = join(IEXEC_OUT, 'computed.json');
    writeFileSync(computedPath, JSON.stringify({ 'deterministic-output-path': resultPath }));
    
    console.log('');
    console.log('📁 Output written to:', resultPath);
    console.log('');
    
    if (pushResult.success) {
        console.log('🎉 Secret generation and push complete!');
        console.log('');
        console.log('📌 The secret is now in SMS and can be used by ConsumeApp');
        console.log('   Nobody (dev or user) has seen the secret value!');
    } else {
        console.log('⚠️ Secret was generated but push to SMS failed');
        console.log('   Error:', pushResult.error);
    }
}

// Run the main function
main().catch(error => {
    console.error('❌ Error:', error.message);
    process.exit(1);
});
