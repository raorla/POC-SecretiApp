import { IExec } from 'iexec';
import { Wallet, JsonRpcProvider } from 'ethers';

interface KeyManagerParams {
  sessionId: string;
  apiKey: string;
  expiresAt: string;
}

interface KeyManagerResult {
  success: boolean;
  action: string;
  sessionId: string;
  sessionKey: { key: string; iv: string };
  encryptedApiKey: string;
  expiresAt: string;
  createdAt: string;
}

interface AIOracleParams {
  provider: string;
  model: string;
  maxTokens: number;
  prompt: string;
  sessionKey: { key: string; iv: string }; // Session key for decryption in TEE
  encryptedApiKey: string; // Encrypted API key (to be decrypted in TEE)
}

interface AIOracleResult {
  success: boolean;
  provider: string;
  model: string;
  response: string;
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
  timestamp: string;
}

interface TaskDetails {
  taskId: string;
  dealId: string;
  status: string;
  statusName: string;
  completionDate?: string;
  resultDigest?: string;
}

export class IExecService {
  private iexec: IExec;
  private provider: JsonRpcProvider;
  private keyManagerApp: string;
  private aiOracleApp: string;
  private workerpool: string;
  
  constructor() {
    const privateKey = process.env.DEDICATED_WALLET_PRIVATE_KEY;
    const rpcUrl = process.env.RPC_URL || 'https://sepolia-rollup.arbitrum.io/rpc';
    
    if (!privateKey) {
      throw new Error('DEDICATED_WALLET_PRIVATE_KEY is required');
    }
    
    this.provider = new JsonRpcProvider(rpcUrl);
    const wallet = new Wallet(privateKey, this.provider);
    
    // Configuration complète pour Arbitrum Sepolia Testnet
    const chainConfig = {
      id: '421614',
      host: rpcUrl,
      hub: '0xB2157BF2fAb286b2A4170E3491Ac39770111Da3E',
      sms: 'https://sms.arbitrum-sepolia-testnet.iex.ec',
      resultProxy: 'https://ipfs-upload.arbitrum-sepolia-testnet.iex.ec',
      iexecGateway: 'https://api-market.arbitrum-sepolia-testnet.iex.ec',
      ipfsGateway: 'https://ipfs-gateway.arbitrum-sepolia-testnet.iex.ec',
    };
    
    this.iexec = new IExec({ ethProvider: wallet as any }, {
      hubAddress: chainConfig.hub,
      smsURL: chainConfig.sms,
      resultProxyURL: chainConfig.resultProxy,
      iexecGatewayURL: chainConfig.iexecGateway,
      ipfsGatewayURL: chainConfig.ipfsGateway,
    });
    
    this.keyManagerApp = process.env.KEY_MANAGER_APP || '';
    this.aiOracleApp = process.env.AI_ORACLE_APP || '';
    this.workerpool = process.env.WORKERPOOL || '0xB967057a21dc6A66A29721d96b8Aa7454B7c383F';
  }
  
  async runKeyManager(params: KeyManagerParams): Promise<{ taskId: string; dealId: string }> {
    const { sessionId, apiKey, expiresAt } = params;
    console.log('Starting KeyManager for session', sessionId);
    
    const iexecArgs = 'generate-session ' + sessionId + ' ' + expiresAt;
    const secretName = 'km_' + sessionId + '_' + Date.now();
    
    await this.iexec.secrets.pushRequesterSecret(secretName, apiKey);
    
    const appOrderbook = await this.iexec.orderbook.fetchAppOrderbook(this.keyManagerApp);
    if (!appOrderbook.orders.length) throw new Error('No app order available');
    
    const workerpoolOrderbook = await this.iexec.orderbook.fetchWorkerpoolOrderbook({
      workerpool: this.workerpool, category: 0,
    });
    if (!workerpoolOrderbook.orders.length) throw new Error('No workerpool order available');
    
    const requestOrder = await this.iexec.order.createRequestorder({
      app: this.keyManagerApp,
      category: 0,
      workerpool: this.workerpool,
      params: { iexec_args: iexecArgs, iexec_secrets: { 1: secretName } },
      tag: ['tee', 'scone'],
      workerpoolmaxprice: '100000000', // 0.1 RLC - prix du workerpool
    });
    const signedRequestOrder = await this.iexec.order.signRequestorder(requestOrder);

    const { dealid } = await this.iexec.order.matchOrders({
      apporder: appOrderbook.orders[0].order,
      workerpoolorder: workerpoolOrderbook.orders[0].order,
      requestorder: signedRequestOrder,
    });
    
    const deal = await this.iexec.deal.show(dealid);
    const taskId = deal.tasks['0'];
    console.log('KeyManager task created:', taskId);
    
    return { taskId, dealId: dealid };
  }
  
  async runAIOracle(params: AIOracleParams): Promise<{ taskId: string; dealId: string }> {
    const { provider, model, maxTokens, prompt, sessionKey, encryptedApiKey } = params;
    console.log('Starting PrivateAI Oracle (secure mode with encrypted API key)');
    console.log('Session key:', sessionKey.key.substring(0, 16) + '...');
    console.log('Encrypted API key (first 50 chars):', encryptedApiKey.substring(0, 50));
    console.log('Encrypted API key type:', typeof encryptedApiKey);
    
    const iexecArgs = provider + ' ' + model + ' ' + maxTokens;
    const promptSecretName = 'prompt_' + Date.now();
    const sessionKeySecretName = 'sessionkey_' + Date.now();
    const encryptedApiKeySecretName = 'encapikey_' + Date.now();
    
    // Push 3 secrets: prompt, sessionKey JSON, encrypted API key
    await this.iexec.secrets.pushRequesterSecret(promptSecretName, prompt);
    await this.iexec.secrets.pushRequesterSecret(sessionKeySecretName, JSON.stringify(sessionKey));
    await this.iexec.secrets.pushRequesterSecret(encryptedApiKeySecretName, encryptedApiKey);
    
    const appOrderbook = await this.iexec.orderbook.fetchAppOrderbook(this.aiOracleApp);
    if (!appOrderbook.orders.length) throw new Error('No app order available');
    
    const workerpoolOrderbook = await this.iexec.orderbook.fetchWorkerpoolOrderbook({
      workerpool: this.workerpool, category: 0,
    });
    if (!workerpoolOrderbook.orders.length) throw new Error('No workerpool order available');
    
    const requestOrder = await this.iexec.order.createRequestorder({
      app: this.aiOracleApp,
      category: 0,
      workerpool: this.workerpool,
      params: { 
        iexec_args: iexecArgs, 
        iexec_secrets: { 
          1: promptSecretName,
          2: sessionKeySecretName,    // Session key JSON for decryption
          3: encryptedApiKeySecretName  // Encrypted API key
        } 
      },
      tag: ['tee', 'scone'],
      workerpoolmaxprice: '100000000', // 0.1 RLC - prix du workerpool
    });
    const signedRequestOrder = await this.iexec.order.signRequestorder(requestOrder);

    const { dealid } = await this.iexec.order.matchOrders({
      apporder: appOrderbook.orders[0].order,
      workerpoolorder: workerpoolOrderbook.orders[0].order,
      requestorder: signedRequestOrder,
    });
    
    const deal = await this.iexec.deal.show(dealid);
    const taskId = deal.tasks['0'];
    console.log('PrivateAI task created:', taskId);
    
    return { taskId, dealId: dealid };
  }
  
  async waitForTaskResult<T>(taskId: string, timeout: number = 120000): Promise<T> {
    console.log('Waiting for task', taskId);
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      const task = await this.iexec.task.show(taskId);
      const status = this.getStatusName(task.status);
      
      if (status === 'COMPLETED') {
        // Results can be an object with storage and location
        const results = task.results as any;
        let resultCid: string;
        
        if (typeof results === 'object' && results.location) {
          // Extract CID from location like "/ipfs/QmXXX"
          resultCid = results.location.replace('/ipfs/', '');
        } else if (typeof results === 'string') {
          resultCid = results;
        } else {
          throw new Error('Unknown result format: ' + JSON.stringify(results));
        }
        
        console.log('Task completed, fetching result from CID:', resultCid);
        
        const zipUrl = 'https://ipfs-gateway.arbitrum-sepolia-testnet.iex.ec/ipfs/' + resultCid;
        const response = await fetch(zipUrl);
        if (!response.ok) throw new Error('Failed to fetch result from ' + zipUrl);
        
        const contentType = response.headers.get('content-type') || '';
        
        // If it's JSON directly, return it
        if (contentType.includes('application/json')) {
          return await response.json() as T;
        }
        
        // Otherwise it's a zip - extract result.json (iExec output)
        const JSZip = (await import('jszip')).default;
        const zipBuffer = await response.arrayBuffer();
        const zip = await JSZip.loadAsync(zipBuffer);
        
        // Try result.json first (iExec iApp output), then computed.json
        let resultFile = zip.file('result.json') || zip.file('computed.json');
        if (!resultFile) throw new Error('result.json or computed.json not found in result');
        
        const jsonContent = await resultFile.async('string');
        console.log('Result extracted from zip:', jsonContent.substring(0, 200));
        return JSON.parse(jsonContent) as T;
      }
      
      if (status === 'FAILED') throw new Error('Task failed');
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
    throw new Error('Task timed out');
  }
  
  async getTaskStatus(taskId: string): Promise<string> {
    try {
      const task = await this.iexec.task.show(taskId);
      return this.getStatusName(task.status);
    } catch { return 'UNKNOWN'; }
  }
  
  async getTaskDetails(taskId: string): Promise<TaskDetails | null> {
    try {
      const task = await this.iexec.task.show(taskId);
      return {
        taskId: task.taskid,
        dealId: task.dealid,
        status: task.status.toString(),
        statusName: this.getStatusName(task.status),
      };
    } catch { return null; }
  }
  
  async getBalance(): Promise<{ stake: string }> {
    const balance = await this.iexec.account.checkBalance(await this.iexec.wallet.getAddress());
    return { stake: balance.stake.toString() };
  }
  
  private getStatusName(status: number): string {
    const map: Record<number, string> = { 0: 'UNSET', 1: 'ACTIVE', 2: 'REVEALING', 3: 'COMPLETED', 4: 'FAILED' };
    return map[status] || 'UNKNOWN';
  }
}

export type { KeyManagerParams, KeyManagerResult, AIOracleParams, AIOracleResult, TaskDetails };
