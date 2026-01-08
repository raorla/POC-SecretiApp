#!/usr/bin/env node
/**
 * Test complet du flux de secrets de bout en bout
 * 
 * Ce script:
 * 1. Exécute TargetApp (avec wallet principal) pour générer un secret et le pousser vers SMS
 * 2. Exécute ConsumeApp (avec wallet dédié) pour utiliser le secret
 * 3. Compare les hash pour vérifier que tout fonctionne
 */

import { IExec, utils } from 'iexec';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Charger .env
config({ path: join(__dirname, '..', '.env') });

// Couleurs console
const c = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  reset: '\x1b[0m',
  bold: '\x1b[1m'
};

function log(color, ...args) {
  console.log(color, ...args, c.reset);
}

// Configuration
const CONFIG = {
  chainId: 421614,
  rpcUrl: 'https://sepolia-rollup.arbitrum.io/rpc',
  smsUrl: 'https://sms.arbitrum-sepolia-testnet.iex.ec',
  targetApp: process.env.TARGET_APP_ADDRESS || '0xf387db543a0dfc832d80c56a280245b229c50eb5',
  consumeApp: process.env.CONSUME_APP_ADDRESS || '0x20c81761Bf9d84F158F4A505F666c6C5474Ed37d',
  workerpool: process.env.WORKERPOOL_ADDRESS || '0xB967057a21dc6A66A29721d96b8Aa7454B7c383F',
  // Wallet dédié (celui qui pousse et récupère les secrets)
  dedicatedPrivateKey: process.env.DEDICATED_PRIVATE_KEY ,
  // Wallet principal (celui qui a déployé les apps)
  mainPrivateKey: process.env.WALLET_PRIVATE_KEY
};

async function waitForTask(iexec, taskId) {
  log(c.yellow, `   ⏳ Attente de la tâche ${taskId.substring(0, 10)}...`);
  
  // Attendre un peu que la tâche soit créée
  await new Promise(resolve => setTimeout(resolve, 5000));
  
  const taskObservable = await iexec.task.obsTask(taskId);
  
  return new Promise((resolve, reject) => {
    taskObservable.subscribe({
      next: ({ message, task }) => {
        log(c.cyan, `      📊 ${message}`);
        if (task && task.statusName === 'COMPLETED') {
          resolve(task);
        } else if (task && task.statusName === 'FAILED') {
          reject(new Error('Task failed'));
        }
      },
      error: reject,
      complete: () => resolve()
    });
  });
}

async function executeTargetApp(iexec, secretName) {
  log(c.bold + c.magenta, '═══════════════════════════════════════════════════════════════');
  log(c.bold + c.magenta, '    📦 ÉTAPE 1: Exécution de TargetApp');
  log(c.bold + c.magenta, '═══════════════════════════════════════════════════════════════');
  console.log('');

  // Récupérer l'app order
  const { orders: appOrders } = await iexec.orderbook.fetchAppOrderbook(CONFIG.targetApp, {
    workerpool: CONFIG.workerpool,
    minTag: 'tee,scone'
  });
  
  if (!appOrders || appOrders.length === 0) {
    throw new Error('Aucun app order disponible pour TargetApp');
  }
  
  const appOrder = appOrders[0].order;
  log(c.green, '   ✅ App order trouvé');

  // Récupérer le workerpool order TEE
  const { orders: workerpoolOrders } = await iexec.orderbook.fetchWorkerpoolOrderbook({
    workerpool: CONFIG.workerpool,
    category: 0,
    minTag: 'tee,scone'
  });
  
  if (!workerpoolOrders || workerpoolOrders.length === 0) {
    throw new Error('Aucun workerpool order TEE disponible');
  }
  
  const workerpoolOrder = workerpoolOrders[0].order;
  log(c.green, '   ✅ Workerpool order TEE trouvé');

  // Créer le request order
  const requestOrderTemplate = await iexec.order.createRequestorder({
    app: CONFIG.targetApp,
    category: 0,
    tag: 'tee,scone',
    workerpoolmaxprice: 100000000,
    params: {
      iexec_args: `${secretName},api-key`
    }
  });
  
  const requestOrder = await iexec.order.signRequestorder(requestOrderTemplate);
  log(c.green, '   ✅ Request order signé');

  // Exécuter
  log(c.cyan, '   🚀 Lancement de l\'exécution...');
  const { dealid } = await iexec.order.matchOrders({
    apporder: appOrder,
    workerpoolorder: workerpoolOrder,
    requestorder: requestOrder
  });
  
  log(c.green, `   ✅ Deal créé: ${dealid}`);

  // Attendre le résultat
  const deal = await iexec.deal.show(dealid);
  const taskId = deal.tasks['0'];
  
  await waitForTask(iexec, taskId);
  
  const taskResult = await iexec.task.show(taskId);
  log(c.green, '   ✅ TargetApp terminé!');
  
  return {
    dealId: dealid,
    taskId,
    resultLocation: taskResult.results?.location
  };
}

async function executeConsumeApp(iexec, secretName) {
  log(c.bold + c.magenta, '═══════════════════════════════════════════════════════════════');
  log(c.bold + c.magenta, '    📱 ÉTAPE 2: Exécution de ConsumeApp (wallet dédié)');
  log(c.bold + c.magenta, '═══════════════════════════════════════════════════════════════');
  console.log('');

  // Vérifier que le secret existe
  const address = await iexec.wallet.getAddress();
  const secretExists = await iexec.secrets.checkRequesterSecretExists(address, secretName);
  
  if (!secretExists) {
    throw new Error(`Secret "${secretName}" non trouvé pour ${address}`);
  }
  
  log(c.green, `   ✅ Secret "${secretName}" trouvé!`);

  // Récupérer l'app order
  const { orders: appOrders } = await iexec.orderbook.fetchAppOrderbook(CONFIG.consumeApp, {
    workerpool: CONFIG.workerpool,
    minTag: 'tee,scone'
  });
  
  if (!appOrders || appOrders.length === 0) {
    throw new Error('Aucun app order disponible pour ConsumeApp');
  }
  
  const appOrder = appOrders[0].order;
  log(c.green, '   ✅ App order trouvé');

  // Récupérer le workerpool order TEE
  const { orders: workerpoolOrders } = await iexec.orderbook.fetchWorkerpoolOrderbook({
    workerpool: CONFIG.workerpool,
    category: 0,
    minTag: 'tee,scone'
  });
  
  if (!workerpoolOrders || workerpoolOrders.length === 0) {
    throw new Error('Aucun workerpool order TEE disponible');
  }
  
  const workerpoolOrder = workerpoolOrders[0].order;
  log(c.green, '   ✅ Workerpool order TEE trouvé');

  // Créer le request order avec le secret
  const requestOrderTemplate = await iexec.order.createRequestorder({
    app: CONFIG.consumeApp,
    category: 0,
    tag: 'tee,scone',
    workerpoolmaxprice: 100000000,
    params: {
      iexec_args: 'hash',
      iexec_secrets: {
        '1': secretName
      }
    }
  });
  
  const requestOrder = await iexec.order.signRequestorder(requestOrderTemplate);
  log(c.green, '   ✅ Request order signé');

  // Exécuter
  log(c.cyan, '   🚀 Lancement de l\'exécution...');
  const { dealid } = await iexec.order.matchOrders({
    apporder: appOrder,
    workerpoolorder: workerpoolOrder,
    requestorder: requestOrder
  });
  
  log(c.green, `   ✅ Deal créé: ${dealid}`);

  // Attendre le résultat
  const deal = await iexec.deal.show(dealid);
  const taskId = deal.tasks['0'];
  
  await waitForTask(iexec, taskId);
  
  const taskResult = await iexec.task.show(taskId);
  log(c.green, '   ✅ ConsumeApp terminé!');
  
  return {
    dealId: dealid,
    taskId,
    resultLocation: taskResult.results?.location
  };
}

async function fetchResult(location) {
  const ipfsUrl = `https://ipfs-gateway.arbitrum-sepolia-testnet.iex.ec${location}`;
  
  try {
    const response = await fetch(ipfsUrl);
    const buffer = await response.arrayBuffer();
    
    // Le résultat est un ZIP, on doit extraire result.json
    const { execSync } = await import('child_process');
    const fs = await import('fs');
    
    const tempZip = '/tmp/result-temp.zip';
    const tempDir = '/tmp/result-temp';
    
    fs.writeFileSync(tempZip, Buffer.from(buffer));
    execSync(`rm -rf ${tempDir} && unzip -o ${tempZip} -d ${tempDir}`, { stdio: 'pipe' });
    
    const resultJson = fs.readFileSync(`${tempDir}/result.json`, 'utf8');
    return JSON.parse(resultJson);
  } catch (error) {
    console.error('Erreur lors de la récupération du résultat:', error.message);
    return null;
  }
}

async function main() {
  console.log('');
  log(c.bold + c.cyan, '═══════════════════════════════════════════════════════════════');
  log(c.bold + c.cyan, '    🚀 TEST COMPLET DU FLUX DE SECRETS - ARBITRUM SEPOLIA');
  log(c.bold + c.cyan, '═══════════════════════════════════════════════════════════════');
  console.log('');

  // Nom unique pour ce test
  const secretName = `full-test-${Date.now()}`;
  log(c.cyan, `📋 Secret Name: ${secretName}`);
  console.log('');

  // ═══════════════════════════════════════════════════════════════
  // Initialiser iExec avec le wallet principal pour TargetApp
  // ═══════════════════════════════════════════════════════════════
  log(c.yellow, '🔧 Initialisation du wallet principal (pour TargetApp)...');
  
  const mainEthProvider = utils.getSignerFromPrivateKey(CONFIG.rpcUrl, CONFIG.mainPrivateKey);
  const iexecMain = new IExec(
    { ethProvider: mainEthProvider },
    {
      chainId: CONFIG.chainId,
      smsURL: CONFIG.smsUrl,
      resultProxyURL: 'https://ipfs-upload.arbitrum-sepolia-testnet.iex.ec',
      iexecGatewayURL: 'https://api-market.arbitrum-sepolia-testnet.iex.ec'
    }
  );
  
  const mainAddress = await iexecMain.wallet.getAddress();
  log(c.green, `   ✅ Wallet principal: ${mainAddress}`);
  console.log('');

  // ═══════════════════════════════════════════════════════════════
  // Initialiser iExec avec le wallet dédié pour ConsumeApp
  // ═══════════════════════════════════════════════════════════════
  log(c.yellow, '🔧 Initialisation du wallet dédié (pour ConsumeApp)...');
  
  const dedicatedEthProvider = utils.getSignerFromPrivateKey(CONFIG.rpcUrl, CONFIG.dedicatedPrivateKey);
  const iexecDedicated = new IExec(
    { ethProvider: dedicatedEthProvider },
    {
      chainId: CONFIG.chainId,
      smsURL: CONFIG.smsUrl,
      resultProxyURL: 'https://ipfs-upload.arbitrum-sepolia-testnet.iex.ec',
      iexecGatewayURL: 'https://api-market.arbitrum-sepolia-testnet.iex.ec'
    }
  );
  
  const dedicatedAddress = await iexecDedicated.wallet.getAddress();
  log(c.green, `   ✅ Wallet dédié: ${dedicatedAddress}`);
  console.log('');

  // Vérifier les balances
  log(c.yellow, '💰 Vérification des balances...');
  const mainBalance = await iexecMain.account.checkBalance(mainAddress);
  const dedicatedBalance = await iexecDedicated.account.checkBalance(dedicatedAddress);
  console.log(`   Wallet principal: ${mainBalance.stake} nRLC (stake)`);
  console.log(`   Wallet dédié: ${dedicatedBalance.stake} nRLC (stake)`);
  console.log('');

  let targetAppHash, consumeAppHash;

  // ═══════════════════════════════════════════════════════════════
  // ÉTAPE 1: Exécuter TargetApp
  // ═══════════════════════════════════════════════════════════════
  try {
    const targetResult = await executeTargetApp(iexecMain, secretName);
    console.log('');
    log(c.cyan, `   📁 Résultat: ${targetResult.resultLocation}`);
    
    // Récupérer le hash du résultat
    const targetData = await fetchResult(targetResult.resultLocation);
    if (targetData) {
      targetAppHash = targetData.secretInfo?.hash;
      log(c.green, `   🔢 Hash TargetApp: ${targetAppHash}`);
    }
  } catch (error) {
    log(c.red, `❌ Erreur TargetApp: ${error.message}`);
    process.exit(1);
  }

  console.log('');

  // ═══════════════════════════════════════════════════════════════
  // ÉTAPE 2: Exécuter ConsumeApp avec le wallet dédié
  // ═══════════════════════════════════════════════════════════════
  try {
    const consumeResult = await executeConsumeApp(iexecDedicated, secretName);
    console.log('');
    log(c.cyan, `   📁 Résultat: ${consumeResult.resultLocation}`);
    
    // Récupérer le hash du résultat
    const consumeData = await fetchResult(consumeResult.resultLocation);
    if (consumeData) {
      consumeAppHash = consumeData.hashes?.sha256;
      log(c.green, `   🔢 Hash ConsumeApp: ${consumeAppHash}`);
    }
  } catch (error) {
    log(c.red, `❌ Erreur ConsumeApp: ${error.message}`);
    process.exit(1);
  }

  console.log('');

  // ═══════════════════════════════════════════════════════════════
  // ÉTAPE 3: Comparer les hash
  // ═══════════════════════════════════════════════════════════════
  log(c.bold + c.cyan, '═══════════════════════════════════════════════════════════════');
  log(c.bold + c.cyan, '    🔍 VÉRIFICATION DES HASH');
  log(c.bold + c.cyan, '═══════════════════════════════════════════════════════════════');
  console.log('');

  log(c.yellow, `   Hash TargetApp:   ${targetAppHash || 'N/A'}`);
  log(c.yellow, `   Hash ConsumeApp:  ${consumeAppHash || 'N/A'}`);
  console.log('');

  if (targetAppHash && consumeAppHash && targetAppHash === consumeAppHash) {
    log(c.bold + c.green, '   ✅ LES HASH CORRESPONDENT !');
    log(c.green, '   ════════════════════════════════════════════════════════');
    log(c.green, '   ✓ Le secret a été transmis correctement');
    log(c.green, '   ✓ Personne n\'a vu la valeur du secret');
    log(c.green, '   ✓ Les deux iApps ont traité le même secret');
    log(c.green, '   ════════════════════════════════════════════════════════');
  } else {
    log(c.bold + c.red, '   ❌ LES HASH NE CORRESPONDENT PAS !');
    log(c.red, '   Quelque chose s\'est mal passé dans le flux.');
  }

  console.log('');
  log(c.bold + c.cyan, '═══════════════════════════════════════════════════════════════');
  log(c.bold + c.cyan, '    🎉 TEST TERMINÉ');
  log(c.bold + c.cyan, '═══════════════════════════════════════════════════════════════');
  console.log('');
}

main().catch(err => {
  console.error(c.red, '❌ Erreur fatale:', err.message, c.reset);
  console.error(err);
  process.exit(1);
});
