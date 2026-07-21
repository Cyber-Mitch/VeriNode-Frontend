'use client';

import { useCallback, useRef, useState } from 'react';
import { getItem, setItem } from '@/src/lib/sessionStore';

const QUEUE_KEY = 'txRetryQueue';
const MAX_RETRY_ATTEMPTS = 3;
const QUEUE_CAPACITY = 20;
const DUPLICATE_WINDOW_MS = 60_000;
const CONFIRMED_REMOVAL_DELAY_MS = 60_000;

export interface TxQueueEntry {
  txXDR: string;
  txHash: string | null;
  status: 'pending' | 'confirmed' | 'failed';
  createdAt: number;
  retryCount: number;
  nextRetryAt: number | null;
}

export interface TxRetryQueue {
  entries: TxQueueEntry[];
  addEntry: (txXDR: string, txHash: string | null) => TxQueueEntry;
  updateEntry: (txHash: string, updates: Partial<TxQueueEntry>) => void;
  removeEntry: (txHash: string) => void;
  findDuplicate: (txXDR: string) => TxQueueEntry | undefined;
  getPendingEntries: () => TxQueueEntry[];
  getEntriesDueForRetry: () => TxQueueEntry[];
}

function computeBackoff(retryCount: number): number {
  return Math.pow(2, retryCount) * 1000;
}

function loadQueue(): TxQueueEntry[] {
  const stored = getItem<TxQueueEntry[]>(QUEUE_KEY);
  return stored || [];
}

function saveQueue(entries: TxQueueEntry[]): void {
  setItem(QUEUE_KEY, entries);
}

function lruEvict(entries: TxQueueEntry[]): TxQueueEntry[] {
  if (entries.length <= QUEUE_CAPACITY) return entries;
  const pending = entries.filter(e => e.status === 'pending');
  const completed = entries.filter(e => e.status !== 'pending');
  completed.sort((a, b) => a.createdAt - b.createdAt);
  const toRemove = completed.slice(0, entries.length - QUEUE_CAPACITY);
  const removedHashes = new Set(toRemove.map(e => e.txHash));
  return [...pending, ...completed.filter(e => !removedHashes.has(e.txHash))];
}

export function useTxRetryQueue(): TxRetryQueue {
  const [entries, setEntries] = useState<TxQueueEntry[]>(() => loadQueue());
  const entriesRef = useRef<TxQueueEntry[]>(entries);

  const persist = useCallback((updated: TxQueueEntry[]) => {
    const pruned = lruEvict(updated);
    entriesRef.current = pruned;
    setEntries([...pruned]);
    saveQueue(pruned);
  }, []);

  const addEntry = useCallback((txXDR: string, txHash: string | null): TxQueueEntry => {
    const entry: TxQueueEntry = {
      txXDR,
      txHash,
      status: 'pending',
      createdAt: Date.now(),
      retryCount: 0,
      nextRetryAt: null,
    };
    const updated = [entry, ...entriesRef.current];
    persist(updated);
    return entry;
  }, [persist]);

  const updateEntry = useCallback((txHash: string, updates: Partial<TxQueueEntry>) => {
    const updated = entriesRef.current.map(e =>
      e.txHash === txHash || (!e.txHash && 'txHash' in updates && updates.txHash === txHash) ? { ...e, ...updates } : e
    );
    persist(updated);
  }, [persist]);

  const removeEntry = useCallback((txHash: string) => {
    const updated = entriesRef.current.filter(e => e.txHash !== txHash);
    persist(updated);
  }, [persist]);

  const findDuplicate = useCallback((txXDR: string): TxQueueEntry | undefined => {
    const now = Date.now();
    return entriesRef.current.find(
      e => e.txXDR === txXDR && (now - e.createdAt) < DUPLICATE_WINDOW_MS
    );
  }, []);

  const getPendingEntries = useCallback((): TxQueueEntry[] => {
    return entriesRef.current.filter(e => e.status === 'pending');
  }, []);

  const getEntriesDueForRetry = useCallback((): TxQueueEntry[] => {
    const now = Date.now();
    return entriesRef.current.filter(
      e => e.status === 'pending' && e.nextRetryAt !== null && e.nextRetryAt < now && e.retryCount < MAX_RETRY_ATTEMPTS
    );
  }, []);

  return {
    entries,
    addEntry,
    updateEntry,
    removeEntry,
    findDuplicate,
    getPendingEntries,
    getEntriesDueForRetry,
  };
}

export { MAX_RETRY_ATTEMPTS, DUPLICATE_WINDOW_MS, CONFIRMED_REMOVAL_DELAY_MS, computeBackoff, QUEUE_KEY };
