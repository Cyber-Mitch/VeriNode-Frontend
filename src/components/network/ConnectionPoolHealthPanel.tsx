'use client'

import type { PoolHealthSnapshot, PoolHealthMetrics } from '@/types/connectionPool'

const COLOR_MAP: Record<string, string> = {
  green: '#22c55e',
  yellow: '#f59e0b',
  red: '#ef4444',
}

interface MetricTileProps {
  label: string
  value: string | number
}

function MetricTile({ label, value }: MetricTileProps) {
  return (
    <div className="rounded-xl border border-white/10 bg-slate-950/60 p-3">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 font-semibold text-slate-100">{value}</p>
    </div>
  )
}

interface ConnectionPoolHealthPanelProps {
  snapshot: PoolHealthSnapshot | null
  metrics: PoolHealthMetrics | null
  probing?: boolean
}

/**
 * Dashboard panel showing connection-pool health and adaptive-sizing state.
 * Mirrors the layout and colour convention of `FinalityHealthGauge`.
 */
export function ConnectionPoolHealthPanel({
  snapshot,
  metrics,
  probing = false,
}: ConnectionPoolHealthPanelProps) {
  const score = snapshot?.score ?? 0
  const color = snapshot ? COLOR_MAP[snapshot.color] : '#64748b'
  const circumference = 2 * Math.PI * 46
  const offset = circumference - (score / 100) * circumference

  return (
    <section
      className="rounded-3xl border border-white/10 bg-slate-900/80 p-6 text-white"
      aria-label="Connection pool health"
    >
      {/* Header */}
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Connection Pool Health</h2>
          <p className="text-sm text-slate-400">Adaptive sizing · P99 latency probe</p>
        </div>
        <div className="flex items-center gap-2">
          {probing && (
            <span
              className="inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-blue-400"
              aria-label="Probe in progress"
            />
          )}
          <span
            className="rounded-full px-3 py-1 text-xs font-semibold"
            style={{ backgroundColor: `${color}22`, color }}
          >
            {snapshot?.color.toUpperCase() ?? 'LOADING'}
          </span>
        </div>
      </div>

      {/* Score gauge + metrics */}
      <div className="flex flex-col items-center gap-5 sm:flex-row">
        {/* Circular score gauge */}
        <svg viewBox="0 0 120 120" className="h-36 w-36 -rotate-90" aria-hidden="true">
          <circle cx="60" cy="60" r="46" fill="none" stroke="#1e293b" strokeWidth="12" />
          <circle
            cx="60"
            cy="60"
            r="46"
            fill="none"
            stroke={color}
            strokeWidth="12"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
          />
        </svg>

        {/* Numeric score + probe details */}
        <div className="w-full space-y-3">
          <div>
            <p className="text-5xl font-bold">{score}</p>
            <p className="text-sm text-slate-400">Composite score / 100</p>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <MetricTile
              label="Recommended pool size"
              value={snapshot?.recommendedPoolSize ?? '—'}
            />
            <MetricTile
              label="Utilisation"
              value={snapshot ? `${(snapshot.utilisation * 100).toFixed(1)}%` : '—'}
            />
            <MetricTile
              label="P99 latency"
              value={snapshot ? `${snapshot.probe.p99LatencyMs.toFixed(1)} ms` : '—'}
            />
            <MetricTile
              label="Waiting requests"
              value={snapshot?.probe.waitingRequests ?? '—'}
            />
          </div>
        </div>
      </div>

      {/* Scaling decision banner */}
      {snapshot?.scalingReason && (
        <p
          className="mt-4 rounded-lg border border-white/10 bg-slate-800/60 px-4 py-2 text-xs text-slate-300"
          role="status"
          aria-live="polite"
        >
          <span className="font-semibold text-slate-200">Scaling: </span>
          {snapshot.scalingReason}
        </p>
      )}

      {/* Aggregated metrics */}
      {metrics && (
        <div className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <MetricTile label="Window P99" value={`${metrics.p99LatencyMs.toFixed(1)} ms`} />
          <MetricTile label="Avg utilisation" value={`${(metrics.avgUtilisation * 100).toFixed(1)}%`} />
          <MetricTile label="Peak active" value={metrics.peakActiveConnections} />
          <MetricTile label="Availability" value={`${metrics.availabilityPct.toFixed(2)}%`} />
        </div>
      )}
    </section>
  )
}
