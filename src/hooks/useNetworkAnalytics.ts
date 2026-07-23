'use client';

import { useEffect, useRef, useCallback } from 'react';
import type { AggregateConfig, AggregateResult, WorkerResponse } from '@/src/types/analytics';
import { useAnalyticsStore } from '@/src/store/analyticsStore';
import { fetchNetworkAnalytics, toFloat64Array } from '@/src/lib/api/analytics';

const FALLBACK_CHUNK_SIZE = 100000;

function createWorker(): Worker | null {
  try {
    return new Worker(new URL('../workers/analyticsProcessor.worker.ts', import.meta.url));
  } catch {
    return null;
  }
}

function computeFallback(
  data: Float64Array,
  config: AggregateConfig,
  requestId: string,
  onProgress: (progress: number) => void,
  onResult: (result: AggregateResult) => void,
): () => void {
  const totalChunks = Math.ceil(data.length / FALLBACK_CHUNK_SIZE);
  let currentChunk = 0;
  let aborted = false;
  let sum = 0;
  let count = 0;
  let minVal = Infinity;
  let maxVal = -Infinity;
  const allValues: number[] = [];

  function processNextSlice() {
    if (aborted) return;

    const sliceEnd = Math.min(currentChunk + 1, totalChunks);
    for (let c = currentChunk; c < sliceEnd; c++) {
      const start = c * FALLBACK_CHUNK_SIZE;
      const end = Math.min(start + FALLBACK_CHUNK_SIZE, data.length);
      for (let i = start; i < end; i++) {
        const v = data[i];
        if (isNaN(v)) continue;
        sum += v;
        count++;
        if (v < minVal) minVal = v;
        if (v > maxVal) maxVal = v;
        allValues.push(v);
      }
    }

    currentChunk = sliceEnd;
    const progress = Math.round((currentChunk / totalChunks) * 100);
    onProgress(progress);

    if (currentChunk < totalChunks) {
      requestIdleCallback(processNextSlice, { timeout: 200 });
    } else {
      allValues.sort((a, b) => a - b);

      function percentile(p: number): number {
        if (allValues.length === 0) return 0;
        const idx = Math.ceil((p / 100) * allValues.length) - 1;
        return allValues[Math.max(0, idx)];
      }

      const avg = count > 0 ? sum / count : 0;
      onResult({
        avg: Math.round(avg * 100) / 100,
        p50: percentile(50),
        p95: percentile(95),
        p99: percentile(99),
        min: count > 0 ? minVal : 0,
        max: count > 0 ? maxVal : 0,
        count,
      });
    }
  }

  processNextSlice();

  return () => {
    aborted = true;
  };
}

export function useNetworkAnalytics() {
  const workerRef = useRef<Worker | null>(null);
  const requestIdRef = useRef(0);
  const fallbackCleanupRef = useRef<(() => void) | null>(null);
  const store = useAnalyticsStore();

  const handlerRef = useRef<((e: MessageEvent) => void) | null>(null);

  const compute = useCallback(
    async (days: number, config: AggregateConfig) => {
      store.setComputing(true);
      store.setProgress(0);
      store.setError(null);
      store.setResult(null);

      if (fallbackCleanupRef.current) {
        fallbackCleanupRef.current();
        fallbackCleanupRef.current = null;
      }

      const requestId = `req-${++requestIdRef.current}`;
      const now = Date.now();
      const startTime = now - days * 24 * 60 * 60 * 1000;

      try {
        const points = await fetchNetworkAnalytics(startTime, now);
        const data = toFloat64Array(points);

        const worker = workerRef.current;

        if (worker) {
          if (handlerRef.current) {
            worker.removeEventListener('message', handlerRef.current);
          }

          worker.postMessage({ type: 'ABORT', payload: { requestId: '* prev' } });
          worker.postMessage({ type: 'COMPUTE', payload: { data, config, requestId } }, [data.buffer]);

          const handler = (e: MessageEvent) => {
            const msg = e.data as WorkerResponse;
            if (msg.payload.requestId !== requestId) return;

            switch (msg.type) {
              case 'PROGRESS':
                store.setProgress(msg.payload.progress);
                break;
              case 'RESULT':
                store.setResult(msg.payload.result);
                store.setComputing(false);
                store.setProgress(100);
                break;
              case 'ERROR':
                store.setError(msg.payload.message);
                store.setComputing(false);
                break;
            }
          };

          handlerRef.current = handler;
          worker.addEventListener('message', handler);
        } else {
          const cleanup = computeFallback(
            data,
            config,
            requestId,
            (progress) => store.setProgress(progress),
            (result) => {
              store.setResult(result as AggregateResult);
              store.setComputing(false);
              store.setProgress(100);
            },
          );
          fallbackCleanupRef.current = cleanup;
        }
      } catch (err) {
        store.setError(err instanceof Error ? err.message : 'Failed to compute analytics');
        store.setComputing(false);
      }
    },
    [store],
  );

  const cancel = useCallback(() => {
    const worker = workerRef.current;
    if (worker) {
      if (handlerRef.current) {
        worker.removeEventListener('message', handlerRef.current);
        handlerRef.current = null;
      }
      worker.postMessage({ type: 'ABORT', payload: { requestId: '* all' } });
    }
    if (fallbackCleanupRef.current) {
      fallbackCleanupRef.current();
      fallbackCleanupRef.current = null;
    }
    store.setComputing(false);
    store.setProgress(0);
  }, [store]);

  useEffect(() => {
    const worker = createWorker();
    workerRef.current = worker;

    return () => {
      if (worker) {
        if (handlerRef.current) {
          worker.removeEventListener('message', handlerRef.current);
        }
        worker.terminate();
      }
      if (fallbackCleanupRef.current) {
        fallbackCleanupRef.current();
      }
    };
  }, []);

  return {
    result: store.result,
    progress: store.progress,
    isComputing: store.isComputing,
    error: store.error,
    compute,
    cancel,
  };
}
