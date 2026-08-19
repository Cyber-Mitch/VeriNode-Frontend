// Time helpers for the operator dashboard: range presets and epoch<->timestamp
// conversion. Pure functions so they are unit-testable without a DOM.

import type { TimeRange, TimeRangePreset } from '@/src/types/operator';

/** Beacon-chain mainnet genesis (unix seconds) and slot/epoch timing. */
export const MAINNET_GENESIS_UNIX = 1_606_824_023;
export const SECONDS_PER_SLOT = 12;
export const SLOTS_PER_EPOCH = 32;
export const SECONDS_PER_EPOCH = SECONDS_PER_SLOT * SLOTS_PER_EPOCH; // 384

const DAY_MS = 24 * 60 * 60 * 1000;

const PRESET_MS: Record<TimeRangePreset, number> = {
  '24h': DAY_MS,
  '7d': 7 * DAY_MS,
  '30d': 30 * DAY_MS,
};

/** Resolve a TimeRange to absolute [fromMs, toMs] bounds. */
export function timeRangeBounds(range: TimeRange, nowMs = Date.now()): { fromMs: number; toMs: number } {
  if (range.kind === 'custom') {
    const fromMs = Math.min(range.fromMs, range.toMs);
    const toMs = Math.max(range.fromMs, range.toMs);
    return { fromMs, toMs };
  }
  return { fromMs: nowMs - PRESET_MS[range.preset], toMs: nowMs };
}

/** Convert a beacon epoch to unix seconds (start of the epoch). */
export function epochToUnixSeconds(epoch: number, genesisUnix = MAINNET_GENESIS_UNIX): number {
  return genesisUnix + epoch * SECONDS_PER_EPOCH;
}

/** Convert a beacon epoch to unix milliseconds. */
export function epochToUnixMs(epoch: number, genesisUnix = MAINNET_GENESIS_UNIX): number {
  return epochToUnixSeconds(epoch, genesisUnix) * 1000;
}

/**
 * Filter epoch-keyed points to those falling inside a time range. Generic over
 * any point carrying an `epoch` field.
 */
export function filterEpochPointsByRange<T extends { epoch: number }>(
  points: T[],
  range: TimeRange,
  nowMs = Date.now(),
  genesisUnix = MAINNET_GENESIS_UNIX,
): T[] {
  const { fromMs, toMs } = timeRangeBounds(range, nowMs);
  return points.filter((p) => {
    const ms = epochToUnixMs(p.epoch, genesisUnix);
    return ms >= fromMs && ms <= toMs;
  });
}

/** Filter timestamp-keyed points (ms) to a time range. */
export function filterTimestampPointsByRange<T extends { timestamp: number }>(
  points: T[],
  range: TimeRange,
  nowMs = Date.now(),
): T[] {
  const { fromMs, toMs } = timeRangeBounds(range, nowMs);
  return points.filter((p) => p.timestamp >= fromMs && p.timestamp <= toMs);
}
