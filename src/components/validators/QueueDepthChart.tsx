'use client'

import { useMemo, useState } from 'react'
import type { NetworkQueueSnapshot } from '@/src/types/exitQueue'

const VIEW_W = 600
const VIEW_H = 140

/**
 * Area chart showing historical queue depth over time. Uses the same custom
 * SVG approach as the rest of the codebase (no external charting library).
 * Hover crosshair shows the epoch + depth at each data point.
 */
export function QueueDepthChart({ samples }: { samples: NetworkQueueSnapshot[] }) {
  const [hover, setHover] = useState<number | null>(null)

  const { area, line, minDepth, maxDepth } = useMemo(() => {
    if (samples.length < 2) return { area: '', line: '', minDepth: 0, maxDepth: 0 }

    const depths = samples.map((s) => s.queueDepth)
    const minDepth = Math.min(...depths)
    const maxDepth = Math.max(...depths)
    const span = maxDepth - minDepth || 1
    const n = samples.length

    const pts = samples.map((s, i) => ({
      x: (i / (n - 1)) * VIEW_W,
      y: VIEW_H - ((s.queueDepth - minDepth) / span) * VIEW_H,
    }))

    const topLine = pts.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ')
    const area = `${topLine} ${VIEW_W.toFixed(2)},${VIEW_H} 0,${VIEW_H}`
    const line = pts
      .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(2)},${p.y.toFixed(2)}`)
      .join(' ')

    return { area, line, minDepth, maxDepth }
  }, [samples])

  const toX = (i: number) => (samples.length < 2 ? 0 : (i / (samples.length - 1)) * VIEW_W)
  const toY = (depth: number) => {
    const span = maxDepth - minDepth || 1
    return VIEW_H - ((depth - minDepth) / span) * VIEW_H
  }

  if (samples.length < 2) {
    return (
      <div className="flex h-36 items-center justify-center rounded-xl bg-slate-950/60 text-sm text-slate-400">
        Building queue depth history…
      </div>
    )
  }

  return (
    <div className="relative space-y-1">
      <p className="text-[11px] uppercase tracking-wide text-slate-500">Queue depth history</p>
      <div className="relative">
        <svg
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          preserveAspectRatio="none"
          className="h-36 w-full rounded-xl bg-slate-950/60"
          onMouseMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect()
            const frac = (e.clientX - rect.left) / rect.width
            const idx = Math.round(frac * (samples.length - 1))
            setHover(Math.max(0, Math.min(samples.length - 1, idx)))
          }}
          onMouseLeave={() => setHover(null)}
          role="img"
          aria-label="Exit queue depth area chart"
        >
          {/* Filled area */}
          {area && (
            <polygon points={area} fill="rgba(245,158,11,0.12)" stroke="none" />
          )}
          {/* Line */}
          {line && (
            <path
              d={line}
              fill="none"
              stroke="#f59e0b"
              strokeWidth={2}
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          )}
          {/* Crosshair */}
          {hover !== null && samples[hover] && (
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
                cy={toY(samples[hover].queueDepth).toFixed(2)}
                r={4}
                fill="#f59e0b"
                vectorEffect="non-scaling-stroke"
              />
            </>
          )}
        </svg>

        {/* Tooltip */}
        {hover !== null && samples[hover] && (
          <div className="pointer-events-none absolute left-2 top-2 rounded-md border border-white/10 bg-slate-950/95 px-3 py-2 text-xs text-slate-100">
            <div className="font-semibold">Epoch {samples[hover].epoch.toLocaleString()}</div>
            <div className="text-amber-400">
              Depth: {samples[hover].queueDepth.toLocaleString()}
            </div>
            <div className="text-slate-400">
              Churn: {samples[hover].churnLimit}/epoch
            </div>
          </div>
        )}
      </div>

      <div className="flex justify-between text-[11px] text-slate-600">
        <span>{minDepth.toLocaleString()}</span>
        <span>{maxDepth.toLocaleString()}</span>
      </div>
    </div>
  )
}
