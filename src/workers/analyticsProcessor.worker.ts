const CHUNK_SIZE = 100000;

interface AggregateConfig {
  nodeIds?: string[];
  groupBy: 'none' | 'day' | 'week' | 'month';
}

interface ChunkAccumulator {
  sum: number;
  count: number;
  min: number;
  max: number;
  sorted: number[];
}

let abortedRequestId: string | null = null;

self.onmessage = (e: MessageEvent) => {
  const msg = e.data;

  switch (msg.type) {
    case 'COMPUTE': {
      const { data, config, requestId } = msg.payload as {
        data: Float64Array;
        config: AggregateConfig;
        requestId: string;
      };
      abortedRequestId = null;
      computeAggregates(data, config, requestId);
      break;
    }
    case 'ABORT': {
      const { requestId } = msg.payload as { requestId: string };
      abortedRequestId = requestId;
      break;
    }
  }
};

function computeAggregates(
  data: Float64Array,
  config: AggregateConfig,
  requestId: string,
): void {
  try {
    const totalChunks = Math.ceil(data.length / CHUNK_SIZE);
    const merged: ChunkAccumulator = {
      sum: 0,
      count: 0,
      min: Infinity,
      max: -Infinity,
      sorted: [],
    };

    for (let i = 0; i < totalChunks; i++) {
      if (abortedRequestId === requestId) {
        return;
      }

      const start = i * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, data.length);
      const chunk = data.subarray(start, end);

      const chunkResult = processChunk(chunk);
      mergeChunk(merged, chunkResult);

      const progress = Math.round(((i + 1) / totalChunks) * 100);
      self.postMessage({
        type: 'PROGRESS',
        payload: { requestId, progress },
      });
    }

    const result = finalizeResult(merged, config);
    self.postMessage(
      {
        type: 'RESULT',
        payload: { requestId, result },
      },
    );
  } catch (err) {
    self.postMessage({
      type: 'ERROR',
      payload: {
        requestId,
        message: err instanceof Error ? err.message : 'Unknown worker error',
      },
    });
  }
}

function processChunk(chunk: Float64Array): ChunkAccumulator {
  let sum = 0;
  let min = Infinity;
  let max = -Infinity;
  const values: number[] = [];

  for (let i = 0; i < chunk.length; i++) {
    const v = chunk[i];
    if (isNaN(v)) continue;
    sum += v;
    if (v < min) min = v;
    if (v > max) max = v;
    values.push(v);
  }

  values.sort((a, b) => a - b);

  return { sum, count: values.length, min, max, sorted: values };
}

function mergeChunk(merged: ChunkAccumulator, chunk: ChunkAccumulator): void {
  merged.sum += chunk.sum;
  merged.count += chunk.count;
  if (chunk.min < merged.min) merged.min = chunk.min;
  if (chunk.max > merged.max) merged.max = chunk.max;
  merged.sorted = mergeSortedArrays(merged.sorted, chunk.sorted);
}

function mergeSortedArrays(a: number[], b: number[]): number[] {
  const result: number[] = [];
  let i = 0;
  let j = 0;

  while (i < a.length && j < b.length) {
    if (a[i] < b[j]) {
      result.push(a[i]);
      i++;
    } else {
      result.push(b[j]);
      j++;
    }
  }

  while (i < a.length) {
    result.push(a[i]);
    i++;
  }
  while (j < b.length) {
    result.push(b[j]);
    j++;
  }

  return result;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

function finalizeResult(
  merged: ChunkAccumulator,
  _config: AggregateConfig, // eslint-disable-line @typescript-eslint/no-unused-vars
): {
  avg: number;
  p50: number;
  p95: number;
  p99: number;
  min: number;
  max: number;
  count: number;
} {
  const avg = merged.count > 0 ? merged.sum / merged.count : 0;
  return {
    avg: Math.round(avg * 100) / 100,
    p50: percentile(merged.sorted, 50),
    p95: percentile(merged.sorted, 95),
    p99: percentile(merged.sorted, 99),
    min: merged.count > 0 ? merged.min : 0,
    max: merged.count > 0 ? merged.max : 0,
    count: merged.count,
  };
}
