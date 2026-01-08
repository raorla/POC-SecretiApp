#!/usr/bin/env node

/**
 * Secret Generator iApp for iExec
 * 
 * This iApp generates secure secrets and outputs them so they can be used
 * by another iApp. The secrets are generated within a Trusted Execution Environment (TEE).
 * 
 * The output can then be used to push the secret to the SMS for another iApp.
 * 
 * Usage:
 *   args: "targetAppAddress,secretName,secretType"
 *   - targetAppAddress: The address of the iApp that will use this secret
 *   - secretName: Name to identify the secret
 *   - secretType: Type of secret (api-key, password, token, random, uuid)
 */

import { randomBytes, createHash } from 'crypto';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

// Environment variables provided by iExec TEE
const IEXEC_OUT = process.env.IEXEC_OUT || './output';

/**
 * Generate a secure random string
 * @param {number} length - Length of the string
 * @param {string} charset - Character set to use
 * @returns {string} Random string
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
 * @returns {string} UUID
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
 * @param {string} secretType - Type of secret to generate
 * @returns {object} Generated secret with metadata
 */
function generateSecret(secretType) {
    const timestamp = new Date().toISOString();
    let secretValue;
    let metadata = {};
    
    switch (secretType.toLowerCase()) {
        case 'api-key':
            // Generate API key format: prefix_randomstring
            const prefix = generateRandomString(4, 'alpha').toLowerCase();
            const key = generateRandomString(32, 'alphanumeric');
            secretValue = `${prefix}_${key}`;
            metadata = {
                format: 'prefix_key',
                keyLength: 32
            };
            break;
            
        case 'password':
            // Generate strong password with special characters
            secretValue = generateRandomString(24, 'alphanumericSpecial');
            metadata = {
                format: 'strong_password',
                length: 24,
                hasSpecialChars: true
            };
            break;
            
        case 'token':
            // Generate JWT-like token (base64 encoded random bytes)
            const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
            const payload = Buffer.from(JSON.stringify({
                iat: Math.floor(Date.now() / 1000),
                jti: generateUUID()
            })).toString('base64url');
            const signature = randomBytes(32).toString('base64url');
            secretValue = `${header}.${payload}.${signature}`;
            metadata = {
                format: 'jwt-like',
                note: 'This is a random token in JWT format, not a signed JWT'
            };
            break;
            
        case 'uuid':
            secretValue = generateUUID();
            metadata = {
                format: 'uuid-v4'
            };
            break;
            
        case 'hex':
            // Generate 64-character hex string (256 bits)
            secretValue = randomBytes(32).toString('hex');
            metadata = {
                format: 'hex',
                bits: 256
            };
            break;
            
        case 'private-key':
            // Generate a 32-byte private key in hex format (compatible with Ethereum)
            secretValue = '0x' + randomBytes(32).toString('hex');
            metadata = {
                format: 'ethereum-compatible',
                bits: 256,
                warning: 'Store securely, this is a cryptographic private key'
            };
            break;
            
        case 'random':
        default:
            // Generate random bytes in base64
            secretValue = randomBytes(32).toString('base64');
            metadata = {
                format: 'base64',
                bytes: 32
            };
            break;
    }
    
    // Generate a hash of the secret for verification purposes
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
 * Parse command line arguments
 * @param {string[]} args - Command line arguments
 * @returns {object} Parsed arguments
 */
function parseArgs(args) {
    // Expected format: "targetAppAddress,secretName,secretType"
    const argString = args.join(' ').trim();
    
    if (!argString) {
        return {
            targetAppAddress: 'any',
            secretName: 'generated-secret',
            secretType: 'random'
        };
    }
    
    const parts = argString.split(',').map(p => p.trim());
    
    return {
        targetAppAddress: parts[0] || 'any',
        secretName: parts[1] || 'generated-secret',
        secretType: parts[2] || 'random'
    };
}

/**
 * Main function
 */
async function main() {
    console.log('🔐 Secret Generator iApp');
    console.log('========================');
    console.log('Running inside iExec TEE environment');
    console.log('');
    
    // Parse arguments
    const args = process.argv.slice(2);
    const { targetAppAddress, secretName, secretType } = parseArgs(args);
    
    console.log(`📋 Configuration:`);
    console.log(`   Target iApp: ${targetAppAddress}`);
    console.log(`   Secret Name: ${secretName}`);
    console.log(`   Secret Type: ${secretType}`);
    console.log('');
    
    // Generate the secret
    console.log('🎲 Generating secret...');
    const secretData = generateSecret(secretType);
    
    console.log(`✅ Secret generated successfully!`);
    console.log(`   Type: ${secretData.type}`);
    console.log(`   Hash (SHA-256): ${secretData.hash}`);
    console.log(`   Generated at: ${secretData.generatedAt}`);
    console.log('');
    
    // Prepare output
    const output = {
        success: true,
        targetAppAddress,
        secretName,
        secretData: {
            value: secretData.secret,
            hash: secretData.hash,
            type: secretData.type,
            generatedAt: secretData.generatedAt,
            metadata: secretData.metadata
        },
        instructions: {
            description: 'Use this secret with iExec SDK to push it as a requester secret',
            sdkMethod: 'iexec.secrets.pushRequesterSecret(secretName, secretValue)',
            cliCommand: `iexec secrets push-requester-secret "${secretName}" "${secretData.secret}"`,
            envVarAccess: `IEXEC_REQUESTER_SECRET_<INDEX>`,
            note: 'The secret is only visible in this TEE output. Store it securely.'
        }
    };
    
    // Ensure output directory exists
    if (!existsSync(IEXEC_OUT)) {
        mkdirSync(IEXEC_OUT, { recursive: true });
    }
    
    // Write the result
    const resultPath = join(IEXEC_OUT, 'result.json');
    writeFileSync(resultPath, JSON.stringify(output, null, 2));
    
    // Write computed.json for iExec (required for TEE apps)
    const computedPath = join(IEXEC_OUT, 'computed.json');
    const computedData = {
        'deterministic-output-path': resultPath
    };
    writeFileSync(computedPath, JSON.stringify(computedData));
    
    console.log('📁 Output written to:', resultPath);
    console.log('');
    console.log('🎉 Secret generation complete!');
    console.log('');
    console.log('📌 Next steps:');
    console.log('   1. Download the result from iExec');
    console.log('   2. Use the iExec SDK or CLI to push the secret');
    console.log('   3. Reference the secret in your target iApp');
}

// Run the main function
main().catch(error => {
    console.error('❌ Error:', error.message);
    process.exit(1);
});
