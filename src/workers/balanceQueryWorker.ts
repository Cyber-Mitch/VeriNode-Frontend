// Web worker for validator balance range queries.
//
// Decompression and range scans run here so large histories never block the
// UI thread. The worker reads compressed blocks from IndexedDB (available in
// worker scope), merges them, and answers balance_at / first_in_range /
// delta_summary / full_decompress queries. Recently-read validators are kept
// in a small cache so repeated queries skip the IndexedDB round-trip.
//
// bigint is not structured-clonable across the worker boundary in every
// engine, so all balances cross as decimal strings.

import type {
  BalanceQueryRequest,
  BalanceQueryResponse,
  CompressedBalance,
} from '@/src/types/balance';
import { getMergedBalance } from '@/src/services/balanceIndexedDB';
import {
  balanceAt,
  deltaSummary,
  firstBalanceInRange,
  fullDecompress,
  prepare,
  type PreparedBalance,
} from '@/src/utils/deltaCompressor';

interface CacheEntry {
  compressed: CompressedBalance;
  prepared: PreparedBalance;
}

const CACHE_LIMIT = 64;
const cache = new Map<number, CacheEntry>();

async function load(validatorIndex: number): Promise<CacheEntry> {
  const cached = cache.get(validatorIndex);
  if (cached) {
    // Refresh LRU recency.
    cache.delete(validatorIndex);
    cache.set(validatorIndex, cached);
    return cached;
  }

  const compressed = await getMergedBalance(validatorIndex);
  const entry: CacheEntry = { compressed, prepared: prepare(compressed) };
  cache.set(validatorIndex, entry);
  if (cache.size > CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  return entry;
}

function post(message: BalanceQueryResponse): void {
  (self as unknown as Worker).postMessage(message);
}

self.onmessage = async (e: MessageEvent<BalanceQueryRequest>) => {
  const msg = e.data;
  const { requestId } = msg.payload;

  try {
    switch (msg.type) {
      case 'BALANCE_AT': {
        const { prepared } = await load(msg.payload.validatorIndex);
        const balance = balanceAt(prepared, msg.payload.epoch);
        post({
          type: 'BALANCE_AT',
          payload: { requestId, balance: balance === null ? null : balance.toString() },
        });
        break;
      }
      case 'FIRST_IN_RANGE': {
        const { compressed } = await load(msg.payload.validatorIndex);
        const found = firstBalanceInRange(compressed, msg.payload.fromEpoch, msg.payload.toEpoch);
        post({
          type: 'FIRST_IN_RANGE',
          payload: found
            ? { requestId, epoch: found.epoch, balance: found.balance.toString() }
            : { requestId, epoch: null, balance: null },
        });
        break;
      }
      case 'DELTA_SUMMARY': {
        const { compressed } = await load(msg.payload.validatorIndex);
        const summary = deltaSummary(compressed, msg.payload.fromEpoch, msg.payload.toEpoch);
        post({
          type: 'DELTA_SUMMARY',
          payload: {
            requestId,
            rewards: summary.rewards.toString(),
            penalties: summary.penalties.toString(),
            netChange: summary.netChange.toString(),
          },
        });
        break;
      }
      case 'FULL_DECOMPRESS': {
        const { compressed } = await load(msg.payload.validatorIndex);
        const series = fullDecompress(compressed).map((s) => ({
          epoch: s.epoch,
          balanceGwei: s.balanceGwei.toString(),
        }));
        post({ type: 'FULL_DECOMPRESS', payload: { requestId, series } });
        break;
      }
    }
  } catch (err) {
    post({
      type: 'ERROR',
      payload: { requestId, message: err instanceof Error ? err.message : 'Unknown worker error' },
    });
  }
};
