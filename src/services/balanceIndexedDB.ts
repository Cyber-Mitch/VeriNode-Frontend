// IndexedDB persistence for compressed validator balance histories.
//
// One object store holds compressed blocks keyed by `${validatorIndex}:${baseEpoch}`.
// A validator may accumulate several non-overlapping blocks over time (each
// upsert writes/replaces one block); reads merge them into a single
// CompressedBalance for querying. Retention GC drops blocks older than a
// configured age.

import type { CompressedBalance, StoredBalanceBlock } from '@/src/types/balance';
import { balanceAt, emptyBlock, prepare } from '@/src/utils/deltaCompressor';

const DB_NAME = 'verinode-balance-history';
const STORE_NAME = 'compressed-balances';
const VERSION = 1;
const INDEX_VALIDATOR = 'validatorIndex';
const INDEX_UPDATED = 'updatedAt';

/** Default retention: 90 days of epochs. */
export const DEFAULT_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;

function blockKey(validatorIndex: number, baseEpoch: number): string {
  return `${validatorIndex}:${baseEpoch}`;
}

export function openBalanceDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'key' });
        store.createIndex(INDEX_VALIDATOR, 'validatorIndex', { unique: false });
        store.createIndex(INDEX_UPDATED, 'updatedAt', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// ---- (de)serialization: bigint <-> decimal string -----------------------

export function serializeBlock(
  validatorIndex: number,
  compressed: CompressedBalance,
  now: number,
): StoredBalanceBlock {
  return {
    key: blockKey(validatorIndex, compressed.baseEpoch),
    validatorIndex,
    baseEpoch: compressed.baseEpoch,
    lastEpoch: compressed.lastEpoch,
    baseBalance: compressed.baseBalance.toString(),
    deltas: compressed.deltas.map((d) => ({ epoch: d.epoch, delta: d.delta.toString() })),
    zeroRuns: compressed.zeroRuns,
    updatedAt: now,
  };
}

export function deserializeBlock(stored: StoredBalanceBlock): CompressedBalance {
  return {
    baseBalance: BigInt(stored.baseBalance),
    baseEpoch: stored.baseEpoch,
    lastEpoch: stored.lastEpoch,
    deltas: stored.deltas.map((d) => ({ epoch: d.epoch, delta: BigInt(d.delta) })),
    zeroRuns: stored.zeroRuns,
  };
}

/**
 * Merge non-overlapping blocks (ascending by baseEpoch) into one
 * CompressedBalance. The balance carried at the end of one block bridges to
 * the next block's base via a synthetic delta, preserving continuity.
 */
export function mergeBlocks(blocks: CompressedBalance[]): CompressedBalance {
  const ordered = blocks
    .filter((b) => b.lastEpoch >= b.baseEpoch)
    .sort((a, b) => a.baseEpoch - b.baseEpoch);
  if (ordered.length === 0) return emptyBlock();

  const first = ordered[0];
  const merged: CompressedBalance = {
    baseBalance: first.baseBalance,
    baseEpoch: first.baseEpoch,
    lastEpoch: first.lastEpoch,
    deltas: [...first.deltas],
    zeroRuns: [...first.zeroRuns],
  };
  let runningBalance = balanceAt(prepare(first), first.lastEpoch) ?? first.baseBalance;

  for (let i = 1; i < ordered.length; i++) {
    const block = ordered[i];
    const bridge = block.baseBalance - runningBalance;
    if (bridge !== BigInt(0)) {
      merged.deltas.push({ epoch: block.baseEpoch, delta: bridge });
    } else {
      merged.zeroRuns.push({ startEpoch: block.baseEpoch, zeroLength: 1 });
    }
    merged.deltas.push(...block.deltas);
    merged.zeroRuns.push(...block.zeroRuns);
    merged.lastEpoch = block.lastEpoch;
    runningBalance = balanceAt(prepare(block), block.lastEpoch) ?? block.baseBalance;
  }

  merged.deltas.sort((a, b) => a.epoch - b.epoch);
  merged.zeroRuns.sort((a, b) => a.startEpoch - b.startEpoch);
  return merged;
}

// ---- public API ----------------------------------------------------------

/** Upsert one compressed block for a validator. */
export async function putCompressedBalance(
  validatorIndex: number,
  compressed: CompressedBalance,
  now = Date.now(),
): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  const db = await openBalanceDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(serializeBlock(validatorIndex, compressed, now));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

/** Load every stored block for a validator (ascending by baseEpoch). */
export async function getBlocks(validatorIndex: number): Promise<CompressedBalance[]> {
  if (typeof indexedDB === 'undefined') return [];
  const db = await openBalanceDb();
  try {
    const stored = await new Promise<StoredBalanceBlock[]>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const index = tx.objectStore(STORE_NAME).index(INDEX_VALIDATOR);
      const request = index.getAll(IDBKeyRange.only(validatorIndex));
      request.onsuccess = () => resolve((request.result as StoredBalanceBlock[]) ?? []);
      request.onerror = () => reject(request.error);
    });
    return stored.map(deserializeBlock).sort((a, b) => a.baseEpoch - b.baseEpoch);
  } finally {
    db.close();
  }
}

/** Load and merge all of a validator's blocks into a single queryable block. */
export async function getMergedBalance(validatorIndex: number): Promise<CompressedBalance> {
  return mergeBlocks(await getBlocks(validatorIndex));
}

/** Remove every block for a validator. */
export async function clearValidator(validatorIndex: number): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  const db = await openBalanceDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const index = tx.objectStore(STORE_NAME).index(INDEX_VALIDATOR);
      const request = index.openKeyCursor(IDBKeyRange.only(validatorIndex));
      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) {
          tx.objectStore(STORE_NAME).delete(cursor.primaryKey);
          cursor.continue();
        }
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

/** Garbage-collect blocks not updated within the retention window. */
export async function pruneOldBalances(
  now = Date.now(),
  retentionMs = DEFAULT_RETENTION_MS,
): Promise<number> {
  if (typeof indexedDB === 'undefined') return 0;
  const db = await openBalanceDb();
  const cutoff = now - retentionMs;
  let removed = 0;
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const index = tx.objectStore(STORE_NAME).index(INDEX_UPDATED);
      const request = index.openCursor(IDBKeyRange.upperBound(cutoff, true));
      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) {
          cursor.delete();
          removed++;
          cursor.continue();
        }
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
  return removed;
}
