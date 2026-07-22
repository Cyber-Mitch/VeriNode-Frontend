export type SendTransactionResult =
  | { status: 'confirmed'; txHash: string }
  | { status: 'pending'; txHash: string }
  | { status: 'error'; error: string; code?: string }
  | { status: 'network_error'; error: string };

export type GetTransactionResult =
  | { status: 'confirmed' | 'pending' | 'not_found'; txHash: string }
  | null;

export interface RpcClientConfig {
  endpoint: string;
  timeout?: number;
}

const DEFAULT_CONFIG: RpcClientConfig = {
  endpoint: 'https://soroban-rpc.stellar.org',
  timeout: 10000,
};

let config: RpcClientConfig = { ...DEFAULT_CONFIG };

export function configureRpcClient(cfg: Partial<RpcClientConfig>): void {
  config = { ...config, ...cfg };
}

export async function sendTransaction(txXDR: string): Promise<SendTransactionResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), config.timeout);

  try {
    const response = await fetch(config.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'sendTransaction',
        params: { transaction: txXDR },
      }),
      signal: controller.signal,
    });

    if (!response.ok && response.status >= 500) {
      return { status: 'network_error', error: `RPC server error: ${response.status}` };
    }

    const data = await response.json();

    if (data.error) {
      if (data.error.message?.includes('tx_bad_seq')) {
        return { status: 'error', error: data.error.message, code: 'tx_bad_seq' };
      }
      if (data.error.message?.includes('HostError')) {
        return { status: 'error', error: data.error.message, code: 'HostError' };
      }
      return { status: 'error', error: data.error.message || 'RPC error', code: data.error.code?.toString() };
    }

    const txHash: string = data.result?.hash || '';
    const txStatus: string = data.result?.status || '';

    if (txStatus === 'ERROR') {
      return { status: 'error', error: data.result?.errorResult?.message || 'Transaction error', code: 'tx_failed' };
    }

    if (txStatus === 'PENDING') {
      return { status: 'pending', txHash };
    }

    return { status: 'confirmed', txHash };
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'AbortError') {
      return { status: 'network_error', error: 'Request timed out' };
    }
    return { status: 'network_error', error: err instanceof Error ? err.message : 'Unknown network error' };
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function getTransactionStatus(txHash: string): Promise<GetTransactionResult> {
  try {
    const response = await fetch(config.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'getTransaction',
        params: { hash: txHash },
      }),
    });

    if (!response.ok) return null;

    const data = await response.json();
    if (data.error) return null;

    const status = data.result?.status || 'not_found';
    return { status, txHash };
  } catch {
    return null;
  }
}
