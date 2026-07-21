'use client';

import type { WalletAccount } from '@/src/types/wallet';

export function flushGuard(
  queryKeyPublicKey: string | undefined,
  activeAccount: WalletAccount | null,
): { guardFailed: boolean; guardMessage?: string } {
  if (!activeAccount) {
    return { guardFailed: true, guardMessage: 'No active account' };
  }
  if (!queryKeyPublicKey) {
    return { guardFailed: true, guardMessage: 'No public key in query' };
  }
  if (queryKeyPublicKey !== activeAccount.publicKey) {
    return {
      guardFailed: true,
      guardMessage: `Public key mismatch: query keyed to ${queryKeyPublicKey}, active account is ${activeAccount.publicKey}`,
    };
  }
  return { guardFailed: false };
}
