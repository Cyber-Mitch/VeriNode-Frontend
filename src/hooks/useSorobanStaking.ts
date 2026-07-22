'use client';

import { useCallback, useMemo } from 'react';
import { useWallet } from '@/src/hooks/useWallet';
import { useStakingStore, type StakingAction, type PendingStake } from '@/src/store/stakingStore';
import { staking, StakingSubmitError } from '@/src/lib/api/staking';
import { getTransactionStatus } from '@/src/lib/stellar/rpcClient';

/**
 * Optimistic staking hook.
 *
 * Restructures stake adjustments into a four-state machine per action:
 *
 *   idle ──▶ pending (optimistic) ──▶ confirmed
 *                    └──────────────▶ failed (rollback)
 *
 * The optimistic balance update is applied synchronously (well under the 500ms
 * UX budget) and rolled back if the on-chain transaction fails or times out.
 * State lives in `stakingStore`, persisted to sessionStorage, so it survives
 * tab navigation / component remounts.
 */

/** Soroban finality budget — fail (and roll back) if not confirmed in time. */
export const CONFIRM_TIMEOUT_MS = 30_000;
const CONFIRM_POLL_INTERVAL_MS = 2_000;
/** Keep a settled entry around briefly so the UI can show the result. */
export const SETTLED_REMOVAL_DELAY_MS = 8_000;

const EXPLORER_BASE = 'https://stellar.expert/explorer/testnet/tx';

export function explorerUrl(txHash: string): string {
  return `${EXPLORER_BASE}/${txHash}`;
}

type Toast = (message: string, type: 'info' | 'success' | 'error') => void;

export interface UseSorobanStakingReturn {
  stake: (amount: number) => Promise<void>;
  unstake: (amount: number) => Promise<void>;
  restake: (amount: number) => Promise<void>;
  delegate: (amount: number) => Promise<void>;
  undelegate: (amount: number) => Promise<void>;
  retry: (optimisticTxId: string) => Promise<void>;
  /** In-flight + recently settled optimistic operations. */
  pending: PendingStake[];
  /** Count of operations still awaiting finality. */
  pendingCount: number;
  /** Optimistic spendable balance (deltas applied), or null until seeded. */
  balance: number | null;
}

export function useSorobanStaking(onToast?: (message: string, type: 'info' | 'success' | 'error') => void): UseSorobanStakingReturn {
  const [state, setState] = useState<SubmitState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const queue = useTxRetryQueue();
  const onToastRef = useRef(onToast);
  useEffect(() => {
    onToastRef.current = onToast;
  }, [onToast]);

  const recoverFromRefresh = useCallback(async () => {
    const pending = queue.getPendingEntries();
    for (const entry of pending) {
      if (entry.retryCount < MAX_RETRY_ATTEMPTS && entry.txHash) {
        try {
          const result = await rpcSendTransaction(entry.txXDR);
          if (result.status === 'confirmed') {
            queue.updateEntry(entry.txHash, { status: 'confirmed' });
            onToastRef.current?.('Transaction confirmed', 'success');
            setTimeout(() => queue.removeEntry(entry.txHash!), CONFIRMED_REMOVAL_DELAY_MS);
          } else if (result.status === 'pending') {
            queue.updateEntry(entry.txHash, { status: 'pending', txHash: result.txHash });
          } else if (result.status === 'error' && result.code === 'tx_bad_seq') {
            queue.updateEntry(entry.txHash, { status: 'confirmed' });
            onToastRef.current?.('Transaction already submitted and confirmed', 'success');
            setTimeout(() => queue.removeEntry(entry.txHash!), CONFIRMED_REMOVAL_DELAY_MS);
          } else if (result.status === 'network_error') {
            const retryCount = entry.retryCount + 1;
            const nextRetryAt = Date.now() + computeBackoff(retryCount);
            queue.updateEntry(entry.txHash, { retryCount, nextRetryAt });
          }
        } catch {
          const retryCount = entry.retryCount + 1;
          const nextRetryAt = Date.now() + computeBackoff(retryCount);
          queue.updateEntry(entry.txHash, { retryCount, nextRetryAt });
        }
      } else if (entry.retryCount < MAX_RETRY_ATTEMPTS && !entry.txHash) {
        const hash = await sha256(entry.txXDR);
        queue.updateEntry(hash, { txHash: hash });
        try {
          const result = await rpcSendTransaction(entry.txXDR);
          if (result.status === 'confirmed') {
            queue.updateEntry(hash, { status: 'confirmed' });
            onToastRef.current?.('Transaction confirmed', 'success');
            setTimeout(() => queue.removeEntry(hash), CONFIRMED_REMOVAL_DELAY_MS);
          } else if (result.status === 'pending') {
            queue.updateEntry(hash, { status: 'pending', txHash: result.txHash });
          } else if (result.status === 'network_error') {
            const retryCount = entry.retryCount + 1;
            const nextRetryAt = Date.now() + computeBackoff(retryCount);
            queue.updateEntry(hash, { retryCount, nextRetryAt });
          }
        } catch {
          const retryCount = entry.retryCount + 1;
          const nextRetryAt = Date.now() + computeBackoff(retryCount);
          queue.updateEntry(hash, { retryCount, nextRetryAt });
        }
      }
    }
    await new Promise((r) => setTimeout(r, CONFIRM_POLL_INTERVAL_MS));
  }
}

export function useSorobanStaking(onToast?: Toast): UseSorobanStakingReturn {
  const { activeAccount } = useWallet();
  const source = activeAccount?.publicKey;

  const pending = useStakingStore((s) => s.pending);
  const balance = useStakingStore((s) => s.optimisticBalance);
  const beginOptimistic = useStakingStore((s) => s.beginOptimistic);
  const attachHash = useStakingStore((s) => s.attachHash);
  const confirm = useStakingStore((s) => s.confirm);
  const fail = useStakingStore((s) => s.fail);
  const removePending = useStakingStore((s) => s.removePending);

  const runAction = useCallback(
    async (action: StakingAction, amount: number): Promise<void> => {
      if (!source) {
        onToast?.('Connect a wallet before staking', 'error');
        return;
      }

      // (a) Apply the optimistic balance change immediately and (b) mint a
      // temporary id so the operation is trackable before a real hash exists.
      const optimisticTxId =
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `opt-${Date.now()}-${Math.round(amount)}`;
      beginOptimistic({ optimisticTxId, action, amount });

      try {
        // (c) Submit and (d) record the optimisticTxId -> realTxHash mapping.
        const { transactionHash } = await staking.submit(action, { amount, source });
        attachHash(optimisticTxId, transactionHash);

    try {
      const result = await rpcSendTransaction(txXDR);

      if (result.status === 'confirmed') {
        queue.updateEntry(computedHash, { status: 'confirmed' });
        setTxHash(result.txHash);
        setState('confirmed');
        onToastRef.current?.('Transaction confirmed', 'success');
        setTimeout(() => queue.removeEntry(computedHash), CONFIRMED_REMOVAL_DELAY_MS);
      } else if (result.status === 'pending') {
        queue.updateEntry(computedHash, { txHash: result.txHash, status: 'pending' });
        setTxHash(result.txHash);
        setState('submitting');
        onToastRef.current?.('Transaction submitted — awaiting confirmation', 'info');
      } else if (result.status === 'error') {
        if (result.code === 'tx_bad_seq') {
          queue.updateEntry(computedHash, { status: 'confirmed' });
          setTxHash(computedHash);
          setState('confirmed');
          onToastRef.current?.('Transaction already submitted and confirmed', 'success');
          setTimeout(() => queue.removeEntry(computedHash), CONFIRMED_REMOVAL_DELAY_MS);
        } else {
          queue.updateEntry(computedHash, { status: 'failed' });
          setError(result.error);
          setState('error');
          onToastRef.current?.(result.error, 'error');
        }
      } else if (result.status === 'network_error') {
        const retryCount = entry.retryCount + 1;
        const nextRetryAt = Date.now() + computeBackoff(retryCount);
        queue.updateEntry(computedHash, { retryCount, nextRetryAt, status: 'pending' });
        setError(result.error);
        setState('error');
        onToastRef.current?.(`Network error — will retry (attempt ${retryCount}/${MAX_RETRY_ATTEMPTS})`, 'error');
      }
    },
    [source, beginOptimistic, attachHash, confirm, fail, removePending, onToast]
  );

  const retry = useCallback(
    async (optimisticTxId: string): Promise<void> => {
      const target = useStakingStore
        .getState()
        .pending.find((p) => p.optimisticTxId === optimisticTxId);
      if (!target) return;
      // Drop the failed entry and re-enter the optimistic lifecycle with the
      // same parameters.
      removePending(optimisticTxId);
      await runAction(target.action, target.amount);
    },
    [removePending, runAction]
  );

  return useMemo(
    () => ({
      stake: (amount: number) => runAction('stake', amount),
      unstake: (amount: number) => runAction('unstake', amount),
      restake: (amount: number) => runAction('restake', amount),
      delegate: (amount: number) => runAction('delegate', amount),
      undelegate: (amount: number) => runAction('undelegate', amount),
      retry,
      pending,
      pendingCount: pending.filter((p) => p.status === 'pending').length,
      balance,
    }),
    [runAction, retry, pending, balance]
  );
}

function labelFor(action: StakingAction): string {
  return action.charAt(0).toUpperCase() + action.slice(1);
}
