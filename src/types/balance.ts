// Validator balance history types.
//
// Each epoch (~6.4 min) produces a balance snapshot per validator. Storing
// every snapshot is wasteful: balances change rarely and by small amounts.
// We instead store a base balance plus a chain of per-epoch deltas, and
// run-length-encode the long stretches where the balance does not change.

/** A raw balance observation for a single validator at a single epoch. */
export interface BalanceSnapshot {
  epoch: number;
  /** Effective/actual balance in gwei. */
  balanceGwei: bigint;
}

/** A non-zero balance change at a given epoch (balance_n - balance_n-1). */
export interface DeltaEntry {
  epoch: number;
  delta: bigint;
}

/**
 * A run of consecutive epochs over which the balance did not change.
 * `startEpoch` is the first unchanged epoch; `zeroLength` counts how many
 * consecutive epochs (including the start) carried a zero delta.
 */
export interface RunLengthEntry {
  startEpoch: number;
  zeroLength: number;
}

/**
 * Compressed representation of one validator's balance history.
 *
 * Invariants:
 * - `baseEpoch` is the first observed epoch; `baseBalance` its balance.
 * - `deltas` is sorted ascending by epoch and contains only non-zero changes.
 * - `zeroRuns` is sorted ascending by `startEpoch`; runs never overlap a delta
 *   epoch. Together, deltas + zeroRuns + base fully reconstruct the series.
 * - `lastEpoch` is the last epoch covered by this block (inclusive).
 */
export interface CompressedBalance {
  baseBalance: bigint;
  baseEpoch: number;
  lastEpoch: number;
  deltas: DeltaEntry[];
  zeroRuns: RunLengthEntry[];
}

/** Result of a delta_summary range query. */
export interface DeltaSummary {
  /** Sum of positive deltas (gwei) in range — rewards. */
  rewards: bigint;
  /** Absolute sum of negative deltas (gwei) in range — penalties. */
  penalties: bigint;
  /** Net change across the range (rewards - penalties). */
  netChange: bigint;
}

/**
 * Persisted record shape in IndexedDB. `bigint` is not structured-clonable in
 * every engine path we target, and is not indexable, so balances are stored as
 * decimal strings and rehydrated on read.
 */
export interface StoredBalanceBlock {
  /** Composite key: `${validatorIndex}:${baseEpoch}`. */
  key: string;
  validatorIndex: number;
  baseEpoch: number;
  lastEpoch: number;
  baseBalance: string;
  deltas: Array<{ epoch: number; delta: string }>;
  zeroRuns: RunLengthEntry[];
  /** Wall-clock time the block was written; used for retention GC. */
  updatedAt: number;
}

// ---- Worker message protocol --------------------------------------------

export type BalanceQueryKind = 'BALANCE_AT' | 'FIRST_IN_RANGE' | 'DELTA_SUMMARY' | 'FULL_DECOMPRESS';

export type BalanceQueryRequest =
  | { type: 'BALANCE_AT'; payload: { requestId: string; validatorIndex: number; epoch: number } }
  | { type: 'FIRST_IN_RANGE'; payload: { requestId: string; validatorIndex: number; fromEpoch: number; toEpoch: number } }
  | { type: 'DELTA_SUMMARY'; payload: { requestId: string; validatorIndex: number; fromEpoch: number; toEpoch: number } }
  | { type: 'FULL_DECOMPRESS'; payload: { requestId: string; validatorIndex: number } };

export type BalanceQueryResponse =
  | { type: 'BALANCE_AT'; payload: { requestId: string; balance: string | null } }
  | { type: 'FIRST_IN_RANGE'; payload: { requestId: string; epoch: number; balance: string } | { requestId: string; epoch: null; balance: null } }
  | { type: 'DELTA_SUMMARY'; payload: { requestId: string; rewards: string; penalties: string; netChange: string } }
  | { type: 'FULL_DECOMPRESS'; payload: { requestId: string; series: Array<{ epoch: number; balanceGwei: string }> } }
  | { type: 'ERROR'; payload: { requestId: string; message: string } };
