'use client'

import { useMemo, useState } from 'react'
import type { SyncSpeedPoint, PeerCountPoint } from '@/src/types/sync'

const VIEW_W = 500
const VIEW_H = 100
const PAD_L = 4
const PAD_R = 4
const PAD_T = 8
const PAD_B = 20

type ChartMode = 'speed' | 'peers'

// ---------------------------------------------------------------------------
// Geometry helpers (raw SVG — consistent with RewardsChart and EWMATrendline)
// ---------------------------------------------------------------------------

function buildAreaAndLine(
  series: number[],
  plotW: number,
  plotH: number,
): { area: string; line: string } {
  if (series.length < 2) return { area: '', line: '' }
  const min = Math.min(...series)
  const max = Math.max(...series)
  const span = max - min || 1
  const n = series.length

  const points = series.map((v, i) => {
    const x = (i / (n - 1)) * plotW
    const y = plotH - ((v - min) / span) * plotH
    return { x, y }
  })

  const lineD = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(2)},${p.y.toFixed(2)}`)
    .join(' ')

  const lastX = points[points.length - 1].x
  const area = `${points.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ')} ${lastX.toFixed(2)},${plotH} 0,${plotH}`

  return { area, line: lineD }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface SyncSpeedChartProps {
  speedHistory: SyncSpeedPoint[]
  peerCountHistory: PeerCountPoint[]
}

/**
 * Dual-mode area + line chart for sync speed (blk/s) and peer count over time.
 * Pure SVG — no external chart library required, matching the project's
 * existing RewardsChart / EWMATrendline pattern.
 */
export function SyncSpeedChart({ speedHistory, peerCountHistory }: SyncSpeedChartProps) {
  const [mode, setMode] = useState<ChartMode>('speed')
  const [hover, setHover] = useState<number | null>(null)

  const series =
    mode === 'speed'
      ? speedHistory.map((p) => p.blocksPerSecond)
      : peerCountHistory.map((p) => p.peerCount)

  const timestamps =
    mode === 'speed'
      ? speedHistory.map((p) => p.timestamp)
      : peerCountHistory.map((p) => p.timestamp)

  const plotW = VIEW_W - PAD_L - PAD_R
  const plotH = VIEW_H - PAD_T - PAD_B

  const { area, line } = useMemo(
    () => buildAreaAndLine(series, plotW, plotH),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [series.join(','), plotW, plotH],
  )

  const min = series.length ? Math.min(...series) : 0
  const max = series.length ? Math.max(...series) : 0
  const span = max - min || 1

  function toX(i: number): number {
    if (series.length < 2) return 0
    return PAD_L + (i / (series.length - 1)) * plotW
  }
  function toY(v: number): number {
    return PAD_T + plotH - ((v - min) / span) * plotH
  }

  const accentColor = mode === 'speed' ? '#38bdf8' : '#a78bfa'
  const fillColor = mode === 'speed' ? 'rgba(56,189,248,0.12)' : 'rgba(167,139,250,0.12)'

  const hoverValue = hover !== null ? series[hover] : null
  const hoverTs = hover !== null ? timestamps[hover] : null

  return (
    <div className="space-y-2">
      {/* Toggle */}
      <div className="flex gap-1">
        {(['speed', 'peers'] as ChartMode[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`rounded-lg border px-3 py-1 text-xs font-medium transition-colors ${
              mode === m
                ? 'border-sky-400 bg-sky-400/10 text-white'
                : 'border-white/10 text-slate-400 hover:text-slate-200'
            }`}
          >
            {m === 'speed' ? 'Download speed' : 'Peer count'}
          </button>
        ))}
      </div>

      <div className="relative">
        <svg
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          preserveAspectRatio="none"
          className="h-28 w-full rounded-xl bg-slate-950/60"
          role="img"
          aria-label={mode === 'speed' ? 'Sync download speed over time' : 'Peer count over time'}
          onMouseMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect()
            const frac = (e.clientX - rect.left) / rect.width
            const idx = Math.round(frac * (series.length - 1))
            setHover(Math.max(0, Math.min(series.length - 1, idx)))
          }}
          onMouseLeave={() => setHover(null)}
        >
          {/* Filled area */}
          {area && (
            <polygon
              points={area
                .split(' ')
                .map((pt) => {
                  const [x, y] = pt.split(',')
                  return `${(PAD_L + parseFloat(x)).toFixed(2)},${(PAD_T + parseFloat(y)).toFixed(2)}`
                })
                .join(' ')}
              fill={fillColor}
            />
          )}

          {/* Line */}
          {line && (
            <path
              d={line
                .replace(/M([\d.]+),([\d.]+)/g, (_, x, y) =>
                  `M${(PAD_L + parseFloat(x)).toFixed(2)},${(PAD_T + parseFloat(y)).toFixed(2)}`,
                )
                .replace(/L([\d.]+),([\d.]+)/g, (_, x, y) =>
                  `L${(PAD_L + parseFloat(x)).toFixed(2)},${(PAD_T + parseFloat(y)).toFixed(2)}`,
                )}
              fill="none"
              stroke={accentColor}
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
                y1={PAD_T}
                x2={toX(hover).toFixed(2)}
                y2={PAD_T + plotH}
                stroke="rgba(248,250,252,0.3)"
                strokeWidth={1}
                strokeDasharray="3 3"
                vectorEffect="non-scaling-stroke"
              />
              <circle
                cx={toX(hover).toFixed(2)}
                cy={toY(hoverValue).toFixed(2)}
                r={3}
                fill={accentColor}
                vectorEffect="non-scaling-stroke"
              />
            </>
          )}

          {/* Y-axis guide labels */}
          {series.length > 0 && (
            <>
              <text x={PAD_L + 2} y={PAD_T + 8} fontSize={7} fill="#475569" vectorEffect="non-scaling-stroke">
                {max.toFixed(mode === 'speed' ? 1 : 0)}
              </text>
              <text x={PAD_L + 2} y={PAD_T + plotH - 2} fontSize={7} fill="#475569" vectorEffect="non-scaling-stroke">
                {min.toFixed(mode === 'speed' ? 1 : 0)}
              </text>
            </>
          )}
        </svg>

        {/* Tooltip */}
        {hover !== null && hoverValue !== null && hoverTs !== null && (
          <div className="pointer-events-none absolute left-2 top-2 rounded-md border border-white/10 bg-slate-950/95 px-3 py-2 text-xs text-slate-100">
            <div className="text-slate-400">
              {new Date(hoverTs).toLocaleTimeString()}
            </div>
            <div style={{ color: accentColor }} className="font-semibold">
              {mode === 'speed'
                ? `${hoverValue.toFixed(1)} blk/s`
                : `${hoverValue} peers`}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
