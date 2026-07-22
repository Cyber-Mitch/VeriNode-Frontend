'use client';

import { useEffect, useRef } from 'react';
import { sendTransaction as rpcSendTransaction } from '@/src/lib/stellar/rpcClient';
import { getItem, setItem } from '@/src/lib/sessionStore';
import { QUEUE_KEY, MAX_RETRY_ATTEMPTS, computeBackoff, CONFIRMED_REMOVAL_DELAY_MS } from '@/src/hooks/useTxRetryQueue';
import type { TxQueueEntry } from '@/src/hooks/useTxRetryQueue';
import { useToast } from '@/src/components/Toast';

export function RetryWatcher() {
  const { showToast } = useToast();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    async function processRetries() {
      const entries = getItem<TxQueueEntry[]>(QUEUE_KEY);
      if (!entries) return;

      const now = Date.now();
      let changed = false;

      const updated = await Promise.all(
        entries.map(async (entry) => {
          if (
            entry.status !== 'pending' ||
            entry.retryCount >= MAX_RETRY_ATTEMPTS ||
            !entry.txHash
          ) {
            return entry;
          }

          if (entry.nextRetryAt !== null && entry.nextRetryAt > now) {
            return entry;
          }

          try {
            const result = await rpcSendTransaction(entry.txXDR);

            if (result.status === 'confirmed') {
              changed = true;
              showToast('Transaction confirmed', 'success');
              setTimeout(() => {
                const current = getItem<TxQueueEntry[]>(QUEUE_KEY);
                if (current) {
                  setItem(QUEUE_KEY, current.filter(e => e.txHash !== entry.txHash));
                }
              }, CONFIRMED_REMOVAL_DELAY_MS);
              return { ...entry, status: 'confirmed' as const, retryCount: entry.retryCount + 1 };
            }

            if (result.status === 'pending') {
              changed = true;
              return { ...entry, txHash: result.txHash, status: 'pending' as const, nextRetryAt: Date.now() + 5000 };
            }

            if (result.status === 'error' && result.code === 'tx_bad_seq') {
              changed = true;
              showToast('Transaction already submitted and confirmed', 'success');
              setTimeout(() => {
                const current = getItem<TxQueueEntry[]>(QUEUE_KEY);
                if (current) {
                  setItem(QUEUE_KEY, current.filter(e => e.txHash !== entry.txHash));
                }
              }, CONFIRMED_REMOVAL_DELAY_MS);
              return { ...entry, status: 'confirmed' as const };
            }

            if (result.status === 'network_error') {
              changed = true;
              const retryCount = entry.retryCount + 1;
              const nextRetryAt = Date.now() + computeBackoff(retryCount);
              return { ...entry, retryCount, nextRetryAt };
            }

            return entry;
          } catch {
            changed = true;
            const retryCount = entry.retryCount + 1;
            const nextRetryAt = Date.now() + computeBackoff(retryCount);
            return { ...entry, retryCount, nextRetryAt };
          }
        })
      );

      if (changed) {
        setItem(QUEUE_KEY, updated);
      }
    }

    processRetries();
    intervalRef.current = setInterval(processRetries, 3000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [showToast]);

  return null;
}
