/**
 * Client script to push secrets to iExec SMS
 * 
 * This script takes the output from the secret-generator iApp
 * and pushes the secret to the Secret Management Service (SMS)
 * so it can be used by another iApp.
 * 
 * Usage:
 *   node scripts/push-secret.js <result.json> [--chain arbitrum-sepolia-testnet]
 */

import { IExec, utils } from 'iexec';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

// Configuration for Arbitrum Sepolia
const ARBITRUM_SEPOLIA_CONFIG = {
    chainId: 421614,
    rpcUrl: 'https://sepolia-rollup.arbitrum.io/rpc',
   // smsUrl: 'https://sms.scone-prod.v8-bellecour.iex.ec',
    iexecGatewayUrl: 'https://api.market.iex.ec'
};

async function main() {
    const args = process.argv.slice(2);
    
    if (args.length < 1) {
        console.error('Usage: node push-secret.js <result.json> [--chain <chain>]');
        console.error('');
        console.error('Example:');
        console.error('  node push-secret.js ./output/result.json');
        console.error('  node push-secret.js ./output/result.json --chain arbitrum-sepolia-testnet');
        process.exit(1);
    }
    
    const resultPath = resolve(args[0]);
    
    // Parse chain option
    let chain = 'arbitrum-sepolia-testnet';
    const chainIndex = args.indexOf('--chain');
    if (chainIndex !== -1 && args[chainIndex + 1]) {
        chain = args[chainIndex + 1];
    }
    
    // Check if result file exists
    if (!existsSync(resultPath)) {
        console.error(`❌ Error: File not found: ${resultPath}`);
        process.exit(1);
    }
    
    // Read the result
    console.log('📖 Reading secret from:', resultPath);
    const resultData = JSON.parse(readFileSync(resultPath, 'utf8'));
    
    if (!resultData.success || !resultData.secretData) {
        console.error('❌ Error: Invalid result file format');
        process.exit(1);
    }
    
    const { secretName, secretData, targetAppAddress } = resultData;
    
    console.log('');
    console.log('🔐 Secret Information:');
    console.log(`   Name: ${secretName}`);
    console.log(`   Type: ${secretData.type}`);
    console.log(`   Hash: ${secretData.hash}`);
    console.log(`   Target iApp: ${targetAppAddress}`);
    console.log('');
    
    // Check for private key in environment
    const privateKey = process.env.PRIVATE_KEY;
    if (!privateKey) {
        console.error('❌ Error: PRIVATE_KEY environment variable not set');
        console.error('');
        console.error('Set your private key:');
        console.error('  export PRIVATE_KEY=0x...');
        process.exit(1);
    }
    
    console.log(`⛓️  Chain: ${chain}`);
    console.log('');
    
    // Initialize iExec SDK
    console.log('🔧 Initializing iExec SDK...');
    
    let ethProvider;
    let iexec;
    
    if (chain === 'arbitrum-sepolia-testnet' || chain === 'arbitrum-sepolia') {
        ethProvider = utils.getSignerFromPrivateKey(
            ARBITRUM_SEPOLIA_CONFIG.rpcUrl,
            privateKey
        );
        iexec = new IExec(
            { ethProvider },
            { 
                chainId: ARBITRUM_SEPOLIA_CONFIG.chainId,
                smsURL: ARBITRUM_SEPOLIA_CONFIG.smsUrl,
                iexecGatewayURL: ARBITRUM_SEPOLIA_CONFIG.iexecGatewayUrl
            }
        );
    } else {
        // Default to bellecour for other chains
        ethProvider = utils.getSignerFromPrivateKey(
            'https://bellecour.iex.ec',
            privateKey
        );
        iexec = new IExec({ ethProvider });
    }
    
    // Get wallet address
    const wallet = await iexec.wallet.getAddress();
    console.log(`👛 Wallet address: ${wallet}`);
    console.log('');
    
    // Check if secret already exists
    console.log('🔍 Checking if secret already exists...');
    const secretExists = await iexec.secrets.checkRequesterSecretExists(wallet, secretName);
    
    if (secretExists) {
        console.log(`⚠️  Warning: Secret "${secretName}" already exists for this wallet`);
        console.log('   Secrets cannot be updated once pushed.');
        console.log('   Use a different secret name if you need a new secret.');
        process.exit(1);
    }
    
    // Push the secret
    console.log(`📤 Pushing secret "${secretName}" to SMS...`);
    
    try {
        const result = await iexec.secrets.pushRequesterSecret(secretName, secretData.value);
        
        if (result.isPushed) {
            console.log('');
            console.log('✅ Secret pushed successfully!');
            console.log('');
            console.log('📌 How to use this secret in an iApp:');
            console.log('');
            console.log('   1. When executing the target iApp, specify the secret in the request:');
            console.log('');
            console.log('      const response = await dataProtectorCore.processProtectedData({');
            console.log(`         app: '${targetAppAddress}',`);
            console.log('         secrets: {');
            console.log(`            1: '${secretName}'  // Reference the secret by name`);
            console.log('         }');
            console.log('      });');
            console.log('');
            console.log('   2. In the iApp code, access the secret via environment variable:');
            console.log('');
            console.log("      const secret = process.env.IEXEC_REQUESTER_SECRET_1;");
            console.log('');
        } else {
            console.error('❌ Failed to push secret');
            process.exit(1);
        }
    } catch (error) {
        console.error('❌ Error pushing secret:', error.message);
        process.exit(1);
    }
}

main().catch(error => {
    console.error('❌ Unexpected error:', error);
    process.exit(1);
});
