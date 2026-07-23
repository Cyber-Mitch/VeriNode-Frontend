export type WalletProviderType = 'freighter' | 'lobstr' | 'xbull' | 'albedo';

export interface WalletAccount {
  publicKey: string;
  provider: WalletProviderType;
}

export interface WalletState {
  activeAccount: WalletAccount | null;
  isConnected: boolean;
  pendingAccountSwitch: boolean;
}

export interface WalletEventMap {
  'wallet:accountFlushed': CustomEvent<{ previousKey: string | null; newKey: string | null }>;
  'stellar-wallet:accountChange': CustomEvent<{ publicKey: string }>;
}

export interface AuthChallenge {
  nonce: string;
  serverId: string;
  expiresAt: number;
}

export interface AuthSession {
  expiresAt: number;
}

declare global {
  interface Window {
    stellarWeb3?: {
      isConnected: () => Promise<{ isConnected: boolean }>;
      getPublicKey: () => Promise<string>;
      signTransaction: (tx: string) => Promise<{ signedTx: string }>;
      signMessage?: (message: string) => Promise<{ signature: string }>;
      getNetwork?: () => Promise<'testnet' | 'public'>;
    };
    webln?: {
      getPublicKey: () => Promise<string>;
      signTransaction: (tx: string) => Promise<string>;
    };
    xbull?: {
      getPublicKey: () => Promise<string>;
      signTransaction: (tx: string) => Promise<string>;
    };
    albedo?: {
      getPublicKey: () => Promise<string>;
      signTransaction: (tx: string) => Promise<string>;
    };
  }
}
