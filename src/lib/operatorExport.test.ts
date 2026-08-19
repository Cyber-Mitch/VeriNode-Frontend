import { describe, expect, it } from 'vitest';
import { buildMetricsCsv, exportFilename } from './operatorExport';
import { epochToUnixMs } from './operatorTime';
import type { OperatorHistory, TimeRange } from '@/src/types/operator';

const NOW = epochToUnixMs(1000); // anchor "now" to epoch 1000's time

const history: OperatorHistory = {
  balances: [
    { epoch: 998, balanceGwei: BigInt(32_000_000_000) },
    { epoch: 999, balanceGwei: BigInt(32_100_000_000) },
  ],
  attestationEffectiveness: [
    { epoch: 999, effectivenessPct: 98.5 },
    { epoch: 1000, effectivenessPct: 97 },
  ],
  proposals: [],
};

const range: TimeRange = { kind: 'preset', preset: '30d' };

describe('operatorExport', () => {
  it('emits a header and one row per epoch present in either series', () => {
    const csv = buildMetricsCsv(history, range, NOW);
    const lines = csv.split('\n');
    expect(lines[0]).toBe('epoch,datetime_utc,balance_eth,attestation_effectiveness_pct');
    // epochs 998, 999, 1000 -> 3 data rows
    expect(lines).toHaveLength(4);
  });

  it('joins balance and effectiveness by epoch, leaving gaps blank', () => {
    const csv = buildMetricsCsv(history, range, NOW);
    const rows = csv.split('\n').slice(1);
    // epoch 998: balance only
    expect(rows[0].startsWith('998,')).toBe(true);
    expect(rows[0].endsWith(',32,')).toBe(true); // balance 32 ETH, effectiveness blank
    // epoch 999: both
    expect(rows[1]).toContain('32.1');
    expect(rows[1].endsWith(',98.5')).toBe(true);
    // epoch 1000: effectiveness only
    expect(rows[2].startsWith('1000,')).toBe(true);
    expect(rows[2].endsWith(',,97')).toBe(true);
  });

  it('produces a timestamped .csv filename', () => {
    expect(exportFilename(0)).toMatch(/^operator-metrics-1970-01-01-00-00-00\.csv$/);
  });
});
