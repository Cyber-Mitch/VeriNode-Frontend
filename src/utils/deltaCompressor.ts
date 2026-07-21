// Delta + run-length compressor for validator balance histories.
//
// A validator emits one balance snapshot per epoch (~6.4 min). Across a day
// that is ~225 snapshots; across 1,000 epochs the balance typically changes
// only ~100 times. We exploit that by storing:
//   - a single base balance at the first epoch,
//   - a chain of non-zero deltas (balance_n - balance_n-1), and
//   - run-length-encoded stretches of unchanged ("zero-delta") epochs.
//
// Reconstruction: balance_at(epoch) = baseBalance + Σ(deltas with epoch ≤ E).
// Zero runs carry no value; they exist only to record that an epoch was
// observed without a change, so full reconstruction can recover the exact
// (and contiguous) epoch series.
//
// Assumption: epochs within a block are contiguous and strictly increasing,
// which is how beacon-chain epochs arrive. Zero runs are therefore expanded
// as startEpoch + k for k in [0, zeroLength).

import type {
  BalanceSnapshot,
  CompressedBalance,
  DeltaEntry,
  DeltaSummary,
  RunLengthEntry,
} from '@/src/types/balance';

const ZERO = BigInt(0);

/** Prepared form of a CompressedBalance with prefix sums for O(log n) reads. */
export interface PreparedBalance {
  baseBalance: bigint;
  baseEpoch: number;
  lastEpoch: number;
  deltas: DeltaEntry[];
  zeroRuns: RunLengthEntry[];
  /** Ascending delta epochs, parallel to `prefix`. */
  deltaEpochs: number[];
  /** prefix[i] = sum of deltas[0..i] inclusive. */
  prefix: bigint[];
}

function isEmpty(c: CompressedBalance): boolean {
  return c.lastEpoch < c.baseEpoch && c.deltas.length === 0 && c.zeroRuns.length === 0;
}

/** An empty block sentinel — produced from empty input, decodes to []. */
export function emptyBlock(): CompressedBalance {
  return { baseBalance: ZERO, baseEpoch: 0, lastEpoch: -1, deltas: [], zeroRuns: [] };
}

/**
 * Compress a list of balance snapshots into base + delta-chain + zero RLE.
 * Input need not be pre-sorted; duplicate epochs keep the last value.
 */
export function compress(historicalBalances: BalanceSnapshot[]): CompressedBalance {
  if (historicalBalances.length === 0) return emptyBlock();

  const sorted = [...historicalBalances].sort((a, b) => a.epoch - b.epoch);

  // Collapse duplicate epochs, keeping the most recent observation.
  const series: BalanceSnapshot[] = [];
  for (const snap of sorted) {
    const last = series[series.length - 1];
    if (last && last.epoch === snap.epoch) series[series.length - 1] = snap;
    else series.push(snap);
  }

  const base = series[0];
  const deltas: DeltaEntry[] = [];
  const zeroRuns: RunLengthEntry[] = [];

  let prevBalance = base.balanceGwei;
  let runStart: number | null = null;
  let runLength = 0;

  const flushRun = () => {
    if (runStart !== null) {
      zeroRuns.push({ startEpoch: runStart, zeroLength: runLength });
      runStart = null;
      runLength = 0;
    }
  };

  for (let i = 1; i < series.length; i++) {
    const { epoch, balanceGwei } = series[i];
    const delta = balanceGwei - prevBalance;

    if (delta === ZERO) {
      if (runStart === null) {
        runStart = epoch;
        runLength = 1;
      } else {
        runLength++;
      }
    } else {
      flushRun();
      deltas.push({ epoch, delta });
    }

    prevBalance = balanceGwei;
  }
  flushRun();

  return {
    baseBalance: base.balanceGwei,
    baseEpoch: base.epoch,
    lastEpoch: series[series.length - 1].epoch,
    deltas,
    zeroRuns,
  };
}

/** Build prefix sums so repeated reads on the same block are O(log n). */
export function prepare(compressed: CompressedBalance): PreparedBalance {
  const deltaEpochs: number[] = new Array(compressed.deltas.length);
  const prefix: bigint[] = new Array(compressed.deltas.length);
  let acc = ZERO;
  for (let i = 0; i < compressed.deltas.length; i++) {
    acc += compressed.deltas[i].delta;
    deltaEpochs[i] = compressed.deltas[i].epoch;
    prefix[i] = acc;
  }
  return {
    baseBalance: compressed.baseBalance,
    baseEpoch: compressed.baseEpoch,
    lastEpoch: compressed.lastEpoch,
    deltas: compressed.deltas,
    zeroRuns: compressed.zeroRuns,
    deltaEpochs,
    prefix,
  };
}

/** First index whose value is strictly greater than `target` (upper bound). */
function upperBound(epochs: number[], target: number): number {
  let lo = 0;
  let hi = epochs.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (epochs[mid] <= target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * Balance at `epoch` from a prepared block in O(log n). Returns null when the
 * epoch precedes the block's coverage; balances beyond `lastEpoch` carry the
 * last known value forward.
 */
export function balanceAt(prepared: PreparedBalance, epoch: number): bigint | null {
  if (epoch < prepared.baseEpoch) return null;
  const idx = upperBound(prepared.deltaEpochs, epoch) - 1;
  const summed = idx >= 0 ? prepared.prefix[idx] : ZERO;
  return prepared.baseBalance + summed;
}

/**
 * Balance at `targetEpoch` via binary search on the delta chain.
 * Throws RangeError if the epoch precedes the block.
 */
export function decompress(compressed: CompressedBalance, targetEpoch: number): bigint {
  const result = balanceAt(prepare(compressed), targetEpoch);
  if (result === null) {
    throw new RangeError(`epoch ${targetEpoch} precedes base epoch ${compressed.baseEpoch}`);
  }
  return result;
}

/**
 * First recorded balance within [fromEpoch, toEpoch], using binary search to
 * locate the boundary. Returns the carried-forward balance at the lower bound
 * if that epoch falls inside the block's coverage.
 */
export function firstBalanceInRange(
  compressed: CompressedBalance,
  fromEpoch: number,
  toEpoch: number,
): { epoch: number; balance: bigint } | null {
  if (isEmpty(compressed) || fromEpoch > toEpoch) return null;

  const lo = Math.max(fromEpoch, compressed.baseEpoch);
  if (lo > Math.min(toEpoch, compressed.lastEpoch)) return null;

  const prepared = prepare(compressed);
  const balance = balanceAt(prepared, lo);
  if (balance === null) return null;
  return { epoch: lo, balance };
}

/**
 * Accumulate rewards/penalties/net change across [fromEpoch, toEpoch] in a
 * single pass over the deltas that fall in range (located via binary search).
 */
export function deltaSummary(
  compressed: CompressedBalance,
  fromEpoch: number,
  toEpoch: number,
): DeltaSummary {
  let rewards = ZERO;
  let penalties = ZERO;

  if (!isEmpty(compressed) && fromEpoch <= toEpoch) {
    const epochs = compressed.deltas.map((d) => d.epoch);
    const start = upperBound(epochs, fromEpoch - 1); // first epoch ≥ fromEpoch
    for (let i = start; i < compressed.deltas.length; i++) {
      const { epoch, delta } = compressed.deltas[i];
      if (epoch > toEpoch) break;
      if (delta > ZERO) rewards += delta;
      else penalties += -delta;
    }
  }

  return { rewards, penalties, netChange: rewards - penalties };
}

/**
 * Fully reconstruct the (contiguous) snapshot series for chart rendering.
 * Walks the union of base, delta, and zero-run epochs in ascending order,
 * carrying the running balance forward.
 */
export function fullDecompress(compressed: CompressedBalance): BalanceSnapshot[] {
  if (isEmpty(compressed)) return [];

  const covered = new Set<number>([compressed.baseEpoch]);
  const deltaMap = new Map<number, bigint>();
  for (const d of compressed.deltas) {
    covered.add(d.epoch);
    deltaMap.set(d.epoch, d.delta);
  }
  for (const run of compressed.zeroRuns) {
    for (let k = 0; k < run.zeroLength; k++) covered.add(run.startEpoch + k);
  }

  const epochs = [...covered].sort((a, b) => a - b);
  const series: BalanceSnapshot[] = new Array(epochs.length);
  let balance = compressed.baseBalance;
  for (let i = 0; i < epochs.length; i++) {
    const epoch = epochs[i];
    if (epoch !== compressed.baseEpoch) balance += deltaMap.get(epoch) ?? ZERO;
    series[i] = { epoch, balanceGwei: balance };
  }
  return series;
}
