// CSV export of operator performance metrics for compliance reporting.
// Pure functions so the CSV shape is unit-testable without a DOM.

import type { OperatorHistory, TimeRange } from '@/src/types/operator';
import { epochToUnixMs, filterEpochPointsByRange } from '@/src/lib/operatorTime';

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

/**
 * Build a CSV of per-epoch performance metrics (balance + attestation
 * effectiveness) within the selected time range. One row per epoch present in
 * either series; missing values are left blank.
 */
export function buildMetricsCsv(
  history: OperatorHistory,
  range: TimeRange,
  nowMs = Date.now(),
): string {
  const balances = filterEpochPointsByRange(history.balances, range, nowMs);
  const effectiveness = filterEpochPointsByRange(history.attestationEffectiveness, range, nowMs);

  const balanceByEpoch = new Map(balances.map((b) => [b.epoch, b.balanceGwei]));
  const effByEpoch = new Map(effectiveness.map((e) => [e.epoch, e.effectivenessPct]));

  const epochs = Array.from(new Set([...balanceByEpoch.keys(), ...effByEpoch.keys()])).sort(
    (a, b) => a - b,
  );

  const header = ['epoch', 'datetime_utc', 'balance_eth', 'attestation_effectiveness_pct'];
  const rows = epochs.map((epoch) => {
    const gwei = balanceByEpoch.get(epoch);
    const balanceEth = gwei === undefined ? '' : (Number(gwei) / 1e9).toString();
    const eff = effByEpoch.get(epoch);
    const datetime = new Date(epochToUnixMs(epoch)).toISOString();
    return [
      String(epoch),
      datetime,
      balanceEth,
      eff === undefined ? '' : eff.toString(),
    ];
  });

  return [header, ...rows].map((cols) => cols.map(csvEscape).join(',')).join('\n');
}

/** A stable, human-readable filename for an export. */
export function exportFilename(nowMs = Date.now()): string {
  const stamp = new Date(nowMs).toISOString().slice(0, 19).replace(/[:T]/g, '-');
  return `operator-metrics-${stamp}.csv`;
}
