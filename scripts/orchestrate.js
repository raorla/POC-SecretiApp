#!/usr/bin/env node

/**
 * Orchestrator Script - Automatic Secret Flow
 * 
 * This script orchestrates the complete secret flow:
 * 1. Runs TargetApp to generate and push a secret to SMS
 * 2. Runs ConsumeApp to use that secret
 * 
 * Both iApps are executed using the dedicated wallet address, so the secret
 * flows automatically from TargetApp → SMS → ConsumeApp without anyone seeing it.
 * 
 * Prerequisites:
 * - Both iApps must be deployed on Arbitrum Sepolia
 * - The dedicated wallet must have RLC tokens
 * 
 * Usage:
 *   node orchestrate.js --targetApp <address> --consumeApp <address> --secretName <name> --secretType <type>
 */

import { IExec, utils } from 'iexec';
import { readFileSync, writeFileSync, existsSync } from 'fs';

// Configuration
const CONFIG = {
    chainId: 421614,
    rpcUrl: 'https://sepolia-rollup.arbitrum.io/rpc',
    smsUrl: 'https://sms.arbitrum-sepolia-testnet.iex.ec',
    resultProxyUrl: 'https://result.arbitrum-sepolia-testnet.iex.ec',
    iexecGatewayUrl: 'https://api.market.iex.ec',
    workerpool: '0xB967057a21dc6A66A29721d96b8Aa7454B7c383F', // Default Arbitrum Sepolia workerpool
    // Dedicated private key (same as in TargetApp App Secret)
    dedicatedPrivateKey: process.env.DEDICATED_PRIVATE_KEY ,
};

/**
 * Parse command line arguments
 */
function parseArgs() {
    const args = process.argv.slice(2);
    const result = {
        targetApp: null,
        consumeApp: null,
        secretName: `auto-secret-${Date.now()}`,
        secretType: 'api-key',
        action: 'validate'
    };

    for (let i = 0; i < args.length; i++) {
        switch (args[i]) {
            case '--targetApp':
                result.targetApp = args[++i];
                break;
            case '--consumeApp':
                result.consumeApp = args[++i];
                break;
            case '--secretName':
                result.secretName = args[++i];
                break;
            case '--secretType':
                result.secretType = args[++i];
                break;
            case '--action':
                result.action = args[++i];
                break;
        }
    }

    return result;
}

/**
 * Wait for a task to complete
 */
async function waitForTask(iexec, dealId) {
    console.log('   ⏳ Waiting for task to complete...');
    
    const taskId = await iexec.deal.computeTaskId(dealId, 0);
    console.log(`   Task ID: ${taskId}`);
    
    // Wait for task completion
    const taskObservable = await iexec.task.obsTask(taskId, { dealId });
    
    return new Promise((resolve, reject) => {
        taskObservable.subscribe({
            next: ({ message, task }) => {
                console.log(`   📊 ${message}`);
                if (task && task.status === 3) { // COMPLETED
                    resolve(task);
                }
            },
            error: (error) => {
                reject(error);
            },
            complete: () => {
                console.log('   ✅ Task observation complete');
            }
        });
    });
}

/**
 * Execute an iApp
 */
async function executeApp(iexec, appAddress, args, requesterSecrets = {}) {
    console.log(`   📱 App: ${appAddress}`);
    console.log(`   📝 Args: ${args}`);
    
    // Fetch app order from marketplace
    const { orders: appOrders } = await iexec.orderbook.fetchAppOrderbook(appAddress);
    if (appOrders.length === 0) {
        throw new Error(`No app order found for ${appAddress}`);
    }
    const appOrder = appOrders[0].order;
    
    // Fetch workerpool order
    const { orders: workerpoolOrders } = await iexec.orderbook.fetchWorkerpoolOrderbook({
        workerpool: CONFIG.workerpool,
        category: 0
    });
    if (workerpoolOrders.length === 0) {
        throw new Error('No workerpool order available');
    }
    const workerpoolOrder = workerpoolOrders[0].order;
    
    // Create request order
    const requestOrderToSign = await iexec.order.createRequestorder({
        app: appAddress,
        category: 0,
        params: {
            iexec_args: args,
            iexec_secrets: requesterSecrets
        }
    });
    
    const requestOrder = await iexec.order.signRequestorder(requestOrderToSign);
    
    // Match orders to create a deal
    const { dealid } = await iexec.order.matchOrders({
        apporder: appOrder,
        workerpoolorder: workerpoolOrder,
        requestorder: requestOrder
    });
    
    console.log(`   📋 Deal: ${dealid}`);
    
    // Wait for task completion
    const task = await waitForTask(iexec, dealid);
    
    return {
        dealId: dealid,
        taskId: task.taskid,
        status: 'completed'
    };
}

/**
 * Main orchestration function
 */
async function main() {
    console.log('🎭 Secret Flow Orchestrator');
    console.log('===========================');
    console.log('');
    
    const args = parseArgs();
    
    if (!args.targetApp || !args.consumeApp) {
        console.error('❌ Error: Both --targetApp and --consumeApp are required');
        console.error('');
        console.error('Usage:');
        console.error('  node orchestrate.js --targetApp <address> --consumeApp <address>');
        console.error('');
        console.error('Options:');
        console.error('  --targetApp <address>   Address of TargetApp (secret generator)');
        console.error('  --consumeApp <address>  Address of ConsumeApp (secret consumer)');
        console.error('  --secretName <name>     Name for the secret (default: auto-secret-<timestamp>)');
        console.error('  --secretType <type>     Type of secret: api-key, password, token, etc.');
        console.error('  --action <action>       ConsumeApp action: validate, use-api, hash, etc.');
        process.exit(1);
    }
    
    console.log('📋 Configuration:');
    console.log(`   TargetApp: ${args.targetApp}`);
    console.log(`   ConsumeApp: ${args.consumeApp}`);
    console.log(`   Secret Name: ${args.secretName}`);
    console.log(`   Secret Type: ${args.secretType}`);
    console.log(`   Consumer Action: ${args.action}`);
    console.log('');
    
    // Initialize iExec SDK with dedicated wallet
    console.log('🔧 Initializing iExec SDK with dedicated wallet...');
    
    const ethProvider = utils.getSignerFromPrivateKey(
        CONFIG.rpcUrl,
        CONFIG.dedicatedPrivateKey
    );
    
    const iexec = new IExec(
        { ethProvider },
        {
            chainId: CONFIG.chainId,
            smsURL: CONFIG.smsUrl,
            resultProxyURL: CONFIG.resultProxyUrl,
            iexecGatewayURL: CONFIG.iexecGatewayUrl
        }
    );
    
    const walletAddress = await iexec.wallet.getAddress();
    console.log(`   Dedicated Wallet: ${walletAddress}`);
    
    // Check wallet balance
    const balance = await iexec.account.checkBalance(walletAddress);
    console.log(`   RLC Balance: ${balance.stake} (stake) / ${balance.locked} (locked)`);
    console.log('');
    
    // Step 1: Execute TargetApp to generate and push secret
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📤 STEP 1: Generate and Push Secret (TargetApp)');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    try {
        const targetResult = await executeApp(
            iexec,
            args.targetApp,
            `${args.secretName},${args.secretType}`
        );
        
        console.log('   ✅ TargetApp completed successfully!');
        console.log(`   Secret "${args.secretName}" is now in SMS`);
        console.log('');
    } catch (error) {
        console.error('   ❌ TargetApp failed:', error.message);
        process.exit(1);
    }
    
    // Step 2: Execute ConsumeApp with the secret
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📥 STEP 2: Use Secret (ConsumeApp)');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    try {
        const consumeResult = await executeApp(
            iexec,
            args.consumeApp,
            args.action,
            { 1: args.secretName } // Inject the secret by name
        );
        
        console.log('   ✅ ConsumeApp completed successfully!');
        console.log('');
    } catch (error) {
        console.error('   ❌ ConsumeApp failed:', error.message);
        process.exit(1);
    }
    
    // Summary
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🎉 SECRET FLOW COMPLETE!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
    console.log('📊 Summary:');
    console.log('   1. TargetApp generated a secret in TEE');
    console.log('   2. Secret was pushed directly to SMS (never exposed)');
    console.log('   3. ConsumeApp used the secret in TEE');
    console.log('');
    console.log('🔐 NOBODY saw the secret value - it stayed in TEE/SMS only!');
}

// Run
main().catch(error => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
});
