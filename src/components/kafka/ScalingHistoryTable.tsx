'use client';

// ScalingHistoryTable — compact table of recent auto-scaling events.
// Issue #109 — Kafka Consumer Lag Monitoring.

import type { ScalingEvent } from '../../types/kafka';

interface ScalingHistoryTableProps {
  events: ScalingEvent[];
  /** Maximum rows to display. Defaults to 20. */
  maxRows?: number;
}

const REASON_LABEL: Record<ScalingEvent['reason'], string> = {
  'lag-high': '↑ Lag high',
  'lag-low': '↓ Lag low',
  manual: '⚙ Manual',
};

const REASON_COLOR: Record<ScalingEvent['reason'], string> = {
  'lag-high': 'text-rose-400',
  'lag-low': 'text-emerald-400',
  manual: 'text-amber-400',
};

function formatTs(ts: number): string {
  return new Date(ts).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function formatLag(lag: number): string {
  if (lag >= 1_000_000) return `${(lag / 1_000_000).toFixed(2)}M`;
  if (lag >= 1_000) return `${(lag / 1_000).toFixed(1)}K`;
  return String(lag);
}

export function ScalingHistoryTable({
  events,
  maxRows = 20,
}: ScalingHistoryTableProps) {
  const visible = events.slice(0, maxRows);

  return (
    <section
      className="rounded-2xl border border-white/10 bg-slate-900/80 p-5"
      aria-label="Scaling event history"
    >
      <h3 className="mb-4 text-base font-semibold text-white">Scaling History</h3>

      {visible.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-500">
          No scaling events recorded yet.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-white/10 text-left text-slate-400">
                <th className="pb-2 pr-4 font-medium">Time</th>
                <th className="pb-2 pr-4 font-medium">Group</th>
                <th className="pb-2 pr-4 font-medium">Instances</th>
                <th className="pb-2 pr-4 font-medium">Lag at Trigger</th>
                <th className="pb-2 font-medium">Reason</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((ev) => (
                <tr
                  key={ev.id}
                  className="border-b border-white/5 text-slate-300 last:border-0"
                >
                  <td className="py-1.5 pr-4 tabular-nums">{formatTs(ev.triggeredAt)}</td>
                  <td className="py-1.5 pr-4 font-mono">{ev.groupId}</td>
                  <td className="py-1.5 pr-4 tabular-nums">
                    {ev.previousInstances} → {ev.targetInstances}
                  </td>
                  <td className="py-1.5 pr-4 tabular-nums">{formatLag(ev.lagAtTrigger)}</td>
                  <td className={`py-1.5 font-medium ${REASON_COLOR[ev.reason]}`}>
                    {REASON_LABEL[ev.reason]}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
