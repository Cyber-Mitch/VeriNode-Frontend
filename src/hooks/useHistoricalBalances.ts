'use client';

import { useCallback, useEffect, useRef } from 'react';
import type {
  BalanceQueryRequest,
  BalanceQueryResponse,
  BalanceSnapshot,
  DeltaSummary,
} from '@/src/types/balance';
import {
  getMergedBalance,
  putCompressedBalance,
} from '@/src/services/balanceIndexedDB';
import {
  balanceAt,
  compress,
  deltaSummary as deltaSummaryUtil,
  firstBalanceInRange,
  fullDecompress,
  prepare,
} from '@/src/utils/deltaCompressor';

const LRU_LIMIT = 50;

interface FirstInRange {
  epoch: number;
  balance: bigint;
}

type Pending = (response: BalanceQueryResponse) => void;

function createWorker(): Worker | null {
  try {
    return new Worker(new URL('../workers/balanceQueryWorker.ts', import.meta.url));
  } catch {
    return null;
  }
}

/**
 * Query validator balance history through the decompression worker, with a
 * main-thread fallback and an in-memory LRU cache of recently reconstructed
 * series (most-recent 50 validators).
 */
export function useHistoricalBalances() {
  const workerRef = useRef<Worker | null>(null);
  const requestIdRef = useRef(0);
  const pendingRef = useRef<Map<string, Pending>>(new Map());
  const seriesCacheRef = useRef<Map<number, BalanceSnapshot[]>>(new Map());

  useEffect(() => {
    const worker = createWorker();
    workerRef.current = worker;
    const pending = pendingRef.current;

    const handler = (e: MessageEvent<BalanceQueryResponse>) => {
      const { requestId } = e.data.payload;
      const resolve = pending.get(requestId);
      if (resolve) {
        pending.delete(requestId);
        resolve(e.data);
      }
    };

    worker?.addEventListener('message', handler);
    return () => {
      worker?.removeEventListener('message', handler);
      worker?.terminate();
      pending.clear();
    };
  }, []);

  const request = useCallback((build: (requestId: string) => BalanceQueryRequest) => {
    const worker = workerRef.current;
    if (!worker) return null;
    const requestId = `bq-${++requestIdRef.current}`;
    const message = build(requestId);
    return new Promise<BalanceQueryResponse>((resolve, reject) => {
      pendingRef.current.set(requestId, resolve);
      try {
        worker.postMessage(message);
      } catch (err) {
        pendingRef.current.delete(requestId);
        reject(err);
      }
    });
  }, []);

  const touchCache = useCallback((validatorIndex: number, series: BalanceSnapshot[]) => {
    const cache = seriesCacheRef.current;
    cache.delete(validatorIndex);
    cache.set(validatorIndex, series);
    if (cache.size > LRU_LIMIT) {
      const oldest = cache.keys().next().value;
      if (oldest !== undefined) cache.delete(oldest);
    }
  }, []);

  /** Compress and persist a batch of raw snapshots for a validator. */
  const ingest = useCallback(
    async (validatorIndex: number, snapshots: BalanceSnapshot[]) => {
      await putCompressedBalance(validatorIndex, compress(snapshots));
      seriesCacheRef.current.delete(validatorIndex);
    },
    [],
  );

  /** Balance at a single epoch (carried forward beyond coverage; null before). */
  const balanceAtEpoch = useCallback(
    async (validatorIndex: number, epoch: number): Promise<bigint | null> => {
      const res = await request((requestId) => ({
        type: 'BALANCE_AT',
        payload: { requestId, validatorIndex, epoch },
      }));
      if (res) {
        if (res.type === 'ERROR') throw new Error(res.payload.message);
        if (res.type === 'BALANCE_AT') {
          return res.payload.balance === null ? null : BigInt(res.payload.balance);
        }
      }
      // Fallback: main thread.
      return balanceAt(prepare(await getMergedBalance(validatorIndex)), epoch);
    },
    [request],
  );

  /** First recorded balance within [fromEpoch, toEpoch]. */
  const firstInRange = useCallback(
    async (
      validatorIndex: number,
      fromEpoch: number,
      toEpoch: number,
    ): Promise<FirstInRange | null> => {
      const res = await request((requestId) => ({
        type: 'FIRST_IN_RANGE',
        payload: { requestId, validatorIndex, fromEpoch, toEpoch },
      }));
      if (res) {
        if (res.type === 'ERROR') throw new Error(res.payload.message);
        if (res.type === 'FIRST_IN_RANGE') {
          return res.payload.epoch === null
            ? null
            : { epoch: res.payload.epoch, balance: BigInt(res.payload.balance) };
        }
      }
      return firstBalanceInRange(await getMergedBalance(validatorIndex), fromEpoch, toEpoch);
    },
    [request],
  );

  /** Rewards / penalties / net change across an epoch range. */
  const summary = useCallback(
    async (
      validatorIndex: number,
      fromEpoch: number,
      toEpoch: number,
    ): Promise<DeltaSummary> => {
      const res = await request((requestId) => ({
        type: 'DELTA_SUMMARY',
        payload: { requestId, validatorIndex, fromEpoch, toEpoch },
      }));
      if (res) {
        if (res.type === 'ERROR') throw new Error(res.payload.message);
        if (res.type === 'DELTA_SUMMARY') {
          return {
            rewards: BigInt(res.payload.rewards),
            penalties: BigInt(res.payload.penalties),
            netChange: BigInt(res.payload.netChange),
          };
        }
      }
      return deltaSummaryUtil(await getMergedBalance(validatorIndex), fromEpoch, toEpoch);
    },
    [request],
  );

  /** Full reconstructed series for charting, served from the LRU when warm. */
  const series = useCallback(
    async (validatorIndex: number): Promise<BalanceSnapshot[]> => {
      const cached = seriesCacheRef.current.get(validatorIndex);
      if (cached) {
        touchCache(validatorIndex, cached);
        return cached;
      }

      const res = await request((requestId) => ({
        type: 'FULL_DECOMPRESS',
        payload: { requestId, validatorIndex },
      }));

      let reconstructed: BalanceSnapshot[];
      if (res && res.type === 'FULL_DECOMPRESS') {
        reconstructed = res.payload.series.map((s) => ({
          epoch: s.epoch,
          balanceGwei: BigInt(s.balanceGwei),
        }));
      } else if (res && res.type === 'ERROR') {
        throw new Error(res.payload.message);
      } else {
        reconstructed = fullDecompress(await getMergedBalance(validatorIndex));
      }

      touchCache(validatorIndex, reconstructed);
      return reconstructed;
    },
    [request, touchCache],
  );

  return { ingest, balanceAtEpoch, firstInRange, summary, series };
}
