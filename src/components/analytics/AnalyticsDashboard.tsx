'use client';

import { useState } from 'react';
import { useNetworkAnalytics } from '@/src/hooks/useNetworkAnalytics';
import { ProgressBar } from '@/src/components/analytics/ProgressBar';

const PRESET_RANGES = [
  { label: '24h', days: 1 },
  { label: '7d', days: 7 },
  { label: '30d', days: 30 },
  { label: '1y', days: 365 },
] as const;

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(2)}K`;
  return n.toLocaleString();
}

function formatLatency(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)}s`;
  return `${ms.toFixed(2)}ms`;
}

export function AnalyticsDashboard() {
  const { result, progress, isComputing, error, compute, cancel } = useNetworkAnalytics();
  const [selectedRange, setSelectedRange] = useState<(typeof PRESET_RANGES)[number]>(PRESET_RANGES[1]);

  function handleRangeClick(range: (typeof PRESET_RANGES)[number]) {
    setSelectedRange(range);
    compute(range.days, { groupBy: 'none' });
  }

  return (
    <div className="rounded-3xl border border-white/10 bg-slate-900/80 p-6 text-white">
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-xl font-semibold">Network Analytics</h2>
        <div className="flex gap-1">
          {PRESET_RANGES.map((range) => (
            <button
              key={range.label}
              onClick={() => handleRangeClick(range)}
              disabled={isComputing}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                selectedRange.label === range.label
                  ? 'bg-amber-400 text-slate-950'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              } disabled:opacity-50`}
            >
              {range.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-rose-500/20 bg-rose-500/10 p-3 text-sm text-rose-300">
          {error}
        </div>
      )}

      {isComputing && (
        <div className="mb-6 space-y-3">
          <ProgressBar value={progress} />
          <button
            onClick={cancel}
            className="text-xs text-slate-400 underline hover:text-slate-300"
          >
            Cancel
          </button>
        </div>
      )}

      {result && !isComputing && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          <StatCard label="Data Points" value={formatNumber(result.count)} />
          <StatCard label="Avg Latency" value={formatLatency(result.avg)} />
          <StatCard label="P50" value={formatLatency(result.p50)} />
          <StatCard label="P95" value={formatLatency(result.p95)} />
          <StatCard label="P99" value={formatLatency(result.p99)} />
          <StatCard label="Min / Max" value={`${formatLatency(result.min)} / ${formatLatency(result.max)}`} />
        </div>
      )}

      {!result && !isComputing && !error && (
        <p className="py-8 text-center text-sm text-slate-500">
          Select a time range to compute network analytics.
        </p>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-slate-950/60 p-4">
      <p className="text-xs uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 text-lg font-semibold text-white">{value}</p>
    </div>
  );
}
