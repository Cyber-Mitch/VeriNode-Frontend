'use client'

import { useMemo, useState } from 'react'
import type { DailyReward } from '@/src/types/rewards'

const VIEW_W = 600
const VIEW_H = 160
const BAR_VIEW_H = 100

const SOURCE_COLORS = {
  proposal: '#f59e0b',   // amber
  attestation: '#38bdf8', // sky
  sync: '#a78bfa',       // violet
}

type ChartView = 'cumulative' | 'daily'

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

function buildAreaPoints(series: number[], width: number, height: number): string {
  if (series.length < 2) return ''
  const min = Math.min(...series)
  const max = Math.max(...series)
  const span = max - min || 1
  const n = series.length

  const topLine = series
    .map((v, i) => {
      const x = (i / (n - 1)) * width
      const y = height - ((v - min) / span) * height
      return `${x.toFixed(2)},${y.toFixed(2)}`
    })
    .join(' ')

  // Close the polygon for the filled area.
  const lastX = ((n - 1) / (n - 1)) * width
  const firstX = 0
  return `${topLine} ${lastX.toFixed(2)},${height} ${firstX},${height}`
}

function buildLinePath(series: number[], width: number, height: number): string {
  if (series.length < 2) return ''
  const min = Math.min(...series)
  const max = Math.max(...series)
  const span = max - min || 1
  const n = series.length

  return series
    .map((v, i) => {
      const x = (i / (n - 1)) * width
      const y = height - ((v - min) / span) * height
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`
    })
    .join(' ')
}

// ---------------------------------------------------------------------------
// Sub-charts
// ---------------------------------------------------------------------------

function CumulativeChart({ records, series }: { records: DailyReward[]; series: number[] }) {
  const [hover, setHover] = useState<number | null>(null)

  const area = useMemo(() => buildAreaPoints(series, VIEW_W, VIEW_H), [series])
  const line = useMemo(() => buildLinePath(series, VIEW_W, VIEW_H), [series])

  const n = records.length
  const hoverRecord = hover !== null ? records[hover] : null
  const hoverValue = hover !== null ? series[hover] : null

  function toX(i: number): number {
    return n < 2 ? 0 : (i / (n - 1)) * VIEW_W
  }

  function toY(value: number): number {
    const min = Math.min(...series)
    const max = Math.max(...series)
    const span = max - min || 1
    return VIEW_H - ((value - min) / span) * VIEW_H
  }

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        preserveAspectRatio="none"
        className="h-40 w-full rounded-xl bg-slate-950/60"
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect()
          const frac = (e.clientX - rect.left) / rect.width
          const idx = Math.round(frac * (n - 1))
          setHover(Math.max(0, Math.min(n - 1, idx)))
        }}
        onMouseLeave={() => setHover(null)}
        role="img"
        aria-label="Cumulative rewards area chart"
      >
        {/* Filled area */}
        {area && (
          <polygon
            points={area}
            fill="rgba(56,189,248,0.12)"
            stroke="none"
          />
        )}
        {/* Line */}
        {line && (
          <path
            d={line}
            fill="none"
            stroke="#38bdf8"
            strokeWidth={2}
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        )}
        {/* Hover crosshair */}
        {hover !== null && hoverValue !== null && (
          <>
            <line
              x1={toX(hover).toFixed(2)}
              y1={0}
              x2={toX(hover).toFixed(2)}
              y2={VIEW_H}
              stroke="rgba(248,250,252,0.4)"
              strokeWidth={1}
              strokeDasharray="3 3"
              vectorEffect="non-scaling-stroke"
            />
            <circle
              cx={toX(hover).toFixed(2)}
              cy={toY(hoverValue).toFixed(2)}
              r={4}
              fill="#38bdf8"
              vectorEffect="non-scaling-stroke"
            />
          </>
        )}
      </svg>

      {hover !== null && hoverRecord && hoverValue !== null && (
        <div className="pointer-events-none absolute left-2 top-2 rounded-md border border-white/10 bg-slate-950/95 px-3 py-2 text-xs text-slate-100">
          <div className="font-semibold">{hoverRecord.date}</div>
          <div className="text-slate-400">
            Cumulative: <span className="text-sky-300">{hoverValue.toFixed(6)} ETH</span>
          </div>
        </div>
      )}
    </div>
  )
}

function DailyBarChart({ records }: { records: DailyReward[] }) {
  const [hover, setHover] = useState<number | null>(null)

  const maxTotal = useMemo(
    () => Math.max(...records.map((r) => r.totalEth), 0.000001),
    [records],
  )

  const n = records.length
  if (n === 0) return null

  const barW = VIEW_W / n

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${VIEW_W} ${BAR_VIEW_H}`}
        preserveAspectRatio="none"
        className="h-28 w-full rounded-xl bg-slate-950/60"
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect()
          const frac = (e.clientX - rect.left) / rect.width
          const idx = Math.floor(frac * n)
          setHover(Math.max(0, Math.min(n - 1, idx)))
        }}
        onMouseLeave={() => setHover(null)}
        role="img"
        aria-label="Daily rewards bar chart by source"
      >
        {records.map((r, i) => {
          const x = i * barW
          let yOffset = BAR_VIEW_H

          return (
            <g key={r.date} opacity={hover === null || hover === i ? 1 : 0.5}>
              {(['proposal', 'attestation', 'sync'] as const).map((src) => {
                const val = r.breakdown[src]
                if (val <= 0) return null
                const h = (val / maxTotal) * BAR_VIEW_H
                yOffset -= h
                return (
                  <rect
                    key={src}
                    x={x + 0.5}
                    y={yOffset}
                    width={Math.max(1, barW - 1)}
                    height={h}
                    fill={SOURCE_COLORS[src]}
                    vectorEffect="non-scaling-stroke"
                  />
                )
              })}
            </g>
          )
        })}
      </svg>

      {hover !== null && records[hover] && (
        <div className="pointer-events-none absolute left-2 top-2 rounded-md border border-white/10 bg-slate-950/95 px-3 py-2 text-xs text-slate-100">
          <div className="font-semibold">{records[hover].date}</div>
          <div className="text-amber-400">
            Proposal: {records[hover].breakdown.proposal.toFixed(6)} ETH
          </div>
          <div className="text-sky-300">
            Attestation: {records[hover].breakdown.attestation.toFixed(6)} ETH
          </div>
          <div className="text-violet-400">
            Sync: {records[hover].breakdown.sync.toFixed(6)} ETH
          </div>
          <div className="mt-1 border-t border-white/10 pt-1 text-slate-300">
            Total: {records[hover].totalEth.toFixed(6)} ETH
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface RewardsChartProps {
  records: DailyReward[]
  cumulativeSeries: number[]
}

/**
 * Dual-view reward chart: cumulative area series and daily stacked bar chart
 * broken down by reward source (proposal / attestation / sync committee).
 */
export function RewardsChart({ records, cumulativeSeries }: RewardsChartProps) {
  const [view, setView] = useState<ChartView>('cumulative')

  if (records.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center rounded-xl bg-slate-950/60 text-sm text-slate-400">
        No chart data available.
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Toggle */}
      <div className="flex gap-1">
        {(['cumulative', 'daily'] as ChartView[]).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setView(v)}
            className={`rounded-lg border px-3 py-1 text-xs font-medium transition-colors ${
              view === v
                ? 'border-sky-400 bg-sky-400/10 text-white'
                : 'border-white/10 text-slate-400 hover:text-slate-200'
            }`}
          >
            {v === 'cumulative' ? 'Cumulative' : 'Daily by source'}
          </button>
        ))}
      </div>

      {view === 'cumulative' ? (
        <CumulativeChart records={records} series={cumulativeSeries} />
      ) : (
        <DailyBarChart records={records} />
      )}

      {/* Legend */}
      <div className="flex flex-wrap gap-3 text-xs text-slate-400">
        {(Object.entries(SOURCE_COLORS) as [keyof typeof SOURCE_COLORS, string][]).map(
          ([src, color]) => (
            <span key={src} className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: color }} />
              {src.charAt(0).toUpperCase() + src.slice(1)}
            </span>
          ),
        )}
      </div>
    </div>
  )
}
