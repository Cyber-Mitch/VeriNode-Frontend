import { describe, expect, it } from 'vitest';
import {
  epochToUnixMs,
  epochToUnixSeconds,
  filterEpochPointsByRange,
  MAINNET_GENESIS_UNIX,
  SECONDS_PER_EPOCH,
  timeRangeBounds,
} from './operatorTime';

describe('operatorTime', () => {
  it('converts epoch to unix time from genesis', () => {
    expect(epochToUnixSeconds(0)).toBe(MAINNET_GENESIS_UNIX);
    expect(epochToUnixSeconds(1)).toBe(MAINNET_GENESIS_UNIX + SECONDS_PER_EPOCH);
    expect(epochToUnixMs(0)).toBe(MAINNET_GENESIS_UNIX * 1000);
  });

  it('resolves preset ranges relative to now', () => {
    const now = 1_000_000_000_000;
    const { fromMs, toMs } = timeRangeBounds({ kind: 'preset', preset: '24h' }, now);
    expect(toMs).toBe(now);
    expect(fromMs).toBe(now - 24 * 60 * 60 * 1000);
  });

  it('normalizes custom ranges (swaps reversed bounds)', () => {
    const b = timeRangeBounds({ kind: 'custom', fromMs: 500, toMs: 100 });
    expect(b.fromMs).toBe(100);
    expect(b.toMs).toBe(500);
  });

  it('filters epoch points to those inside the range', () => {
    // ~225 epochs per day (86400 / 384). Anchor "now" at epoch 1000.
    const now = epochToUnixMs(1000);
    // epoch 10 is ~4.4 days before epoch 1000; epochs 999/1000 are within a day.
    const points = [{ epoch: 10 }, { epoch: 999 }, { epoch: 1000 }];

    const wide = filterEpochPointsByRange(points, { kind: 'preset', preset: '30d' }, now);
    expect(wide.map((p) => p.epoch)).toEqual([10, 999, 1000]);

    const narrow = filterEpochPointsByRange(points, { kind: 'preset', preset: '24h' }, now);
    expect(narrow.map((p) => p.epoch)).toEqual([999, 1000]);
    expect(narrow).not.toContainEqual({ epoch: 10 });
  });
});
