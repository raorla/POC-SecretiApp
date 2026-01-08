#!/usr/bin/env node
/**
 * Exécute ConsumeApp avec le wallet dédié pour récupérer le secret
 */

import { IExec, utils } from 'iexec';

// Configuration
const DEDICATED_PRIVATE_KEY = process.env.DEDICATED_PRIVATE_KEY ;
const RPC_URL = 'https://sepolia-rollup.arbitrum.io/rpc';
const CHAIN_ID = 421614;

const CONSUME_APP = '0x20c81761Bf9d84F158F4A505F666c6C5474Ed37d';
const WORKERPOOL = '0xB967057a21dc6A66A29721d96b8Aa7454B7c383F';
const SECRET_NAME = process.argv[2] || 'flow-test-1767697037';

const c = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  reset: '\x1b[0m',
  bold: '\x1b[1m'
};

async function main() {
  console.log('');
  console.log(c.bold + c.cyan, '🔓 Exécution de ConsumeApp avec le wallet dédié', c.reset);
  console.log(c.cyan, '═'.repeat(50), c.reset);
  console.log('');

  // Initialiser iExec avec le wallet dédié
  const ethProvider = utils.getSignerFromPrivateKey(RPC_URL, DEDICATED_PRIVATE_KEY);
  
  const iexec = new IExec(
    { ethProvider },
    {
      chainId: CHAIN_ID,
      smsURL: 'https://sms.arbitrum-sepolia-testnet.iex.ec',
      resultProxyURL: 'https://ipfs-upload.arbitrum-sepolia-testnet.iex.ec',
      iexecGatewayURL: 'https://api-market.arbitrum-sepolia-testnet.iex.ec'
    }
  );

  const address = await iexec.wallet.getAddress();
  console.log(c.green, `✅ Wallet dédié: ${address}`, c.reset);
  console.log(c.cyan, `   Secret name: ${SECRET_NAME}`, c.reset);
  console.log('');

  // Vérifier les balances
  console.log(c.yellow, '💰 Vérification des balances...', c.reset);
  const balance = await iexec.wallet.checkBalances(address);
  console.log(`   ETH: ${balance.wei} wei`);
  
  const account = await iexec.account.checkBalance(address);
  console.log(`   RLC Stake: ${account.stake} nRLC`);
  console.log('');

  // Vérifier que le secret existe
  console.log(c.yellow, '🔍 Vérification du secret...', c.reset);
  const secretExists = await iexec.secrets.checkRequesterSecretExists(address, SECRET_NAME);
  
  if (!secretExists) {
    console.log(c.red, `❌ Secret "${SECRET_NAME}" non trouvé pour ${address}`, c.reset);
    console.log(c.yellow, '   Le secret doit être poussé par ce wallet avant de l\'utiliser.', c.reset);
    process.exit(1);
  }
  
  console.log(c.green, `✅ Secret "${SECRET_NAME}" trouvé!`, c.reset);
  console.log('');

  // Récupérer les ordres
  console.log(c.yellow, '📋 Récupération des ordres...', c.reset);
  
  // App order
  const { orders: appOrders } = await iexec.orderbook.fetchAppOrderbook(CONSUME_APP, {
    workerpool: WORKERPOOL
  });
  
  if (!appOrders || appOrders.length === 0) {
    console.log(c.red, '❌ Aucun app order disponible', c.reset);
    console.log(c.yellow, '   Il faut d\'abord publier un app order avec le wallet déployeur.', c.reset);
    process.exit(1);
  }
  
  const appOrder = appOrders[0].order;
  console.log(c.green, '✅ App order trouvé', c.reset);

  // Workerpool order - DOIT être TEE compatible
  const { orders: workerpoolOrders } = await iexec.orderbook.fetchWorkerpoolOrderbook({
    workerpool: WORKERPOOL,
    category: 0,
    minTag: 'tee,scone'
  });
  
  if (!workerpoolOrders || workerpoolOrders.length === 0) {
    console.log(c.red, '❌ Aucun workerpool order TEE disponible', c.reset);
    process.exit(1);
  }
  
  const workerpoolOrder = workerpoolOrders[0].order;
  console.log(c.green, '✅ Workerpool order TEE trouvé', c.reset);
  console.log('');

  // Créer le request order avec le secret ET le tag TEE
  console.log(c.yellow, '📝 Création du request order...', c.reset);
  
  const requestOrderTemplate = await iexec.order.createRequestorder({
    app: CONSUME_APP,
    category: 0,
    tag: 'tee,scone',
    workerpoolmaxprice: 100000000, // 0.1 RLC en nRLC
    params: {
      iexec_args: 'hash',
      iexec_secrets: {
        '1': SECRET_NAME
      }
    }
  });
  
  const requestOrder = await iexec.order.signRequestorder(requestOrderTemplate);
  console.log(c.green, '✅ Request order signé', c.reset);
  console.log('');

  // Exécuter
  console.log(c.bold + c.cyan, '🚀 Lancement de l\'exécution...', c.reset);
  
  const { dealid } = await iexec.order.matchOrders({
    apporder: appOrder,
    workerpoolorder: workerpoolOrder,
    requestorder: requestOrder
  });
  
  console.log(c.green, `✅ Deal créé: ${dealid}`, c.reset);
  console.log(`   https://explorer.iex.ec/arbitrum-sepolia-testnet/deal/${dealid}`);
  console.log('');

  // Attendre le résultat
  const deal = await iexec.deal.show(dealid);
  const taskId = deal.tasks['0'];
  
  console.log(c.yellow, `⏳ Attente du résultat (Task: ${taskId})...`, c.reset);
  
  const taskObservable = await iexec.task.obsTask(taskId);
  
  await new Promise((resolve, reject) => {
    taskObservable.subscribe({
      next: ({ message, task }) => {
        console.log(c.cyan, `   📊 ${message}`, c.reset);
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

  // Récupérer le résultat
  const taskResult = await iexec.task.show(taskId);
  
  console.log('');
  console.log(c.bold + c.green, '🎉 ConsumeApp terminé!', c.reset);
  
  if (taskResult.results && taskResult.results.location) {
    console.log(c.cyan, `📁 Résultat: ${taskResult.results.location}`, c.reset);
    console.log('');
    console.log(c.yellow, 'Téléchargez le résultat avec:', c.reset);
    console.log(`   curl -s "${taskResult.results.location}" -o consume-result.zip`);
    console.log(`   unzip consume-result.zip -d consume-result`);
    console.log(`   cat consume-result/result.json`);
  }
}

main().catch(err => {
  console.error(c.red, '❌ Erreur:', err.message, c.reset);
  process.exit(1);
});
