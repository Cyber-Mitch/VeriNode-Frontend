'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { NetworkQueueSnapshot } from '@/src/types/exitQueue'

const VIEW_W = 600
const VIEW_H = 100
/** 7 days in milliseconds — window for the churn rate bar chart. */
const WINDOW_MS = 7 * 24 * 60 * 60 * 1_000

/**
 * Bar chart of validators processed per epoch (min(queueDepth, churnLimit))
 * over the last 7 days. Each bar represents one epoch; bars are grouped by day
 * on the x-axis. Uses the same custom SVG approach as the rest of the codebase.
 */
export function ChurnRateChart({ samples }: { samples: NetworkQueueSnapshot[] }) {
  const [hover, setHover] = useState<number | null>(null)

  // Stable `now` updated every minute so useMemo doesn't call Date.now() directly.
  const [now, setNow] = useState(() => Date.now())
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  useEffect(() => {
    intervalRef.current = setInterval(() => setNow(Date.now()), 60_000)
    return () => {
      if (intervalRef.current !== null) clearInterval(intervalRef.current)
    }
  }, [])

  const { bars, maxChurn } = useMemo(() => {
    const cutoff = now - WINDOW_MS
    const recent = samples.filter((s) => s.timestamp >= cutoff)
    if (recent.length === 0) return { bars: [], maxChurn: 0 }

    const bars = recent.map((s) => ({
      epoch: s.epoch,
      timestamp: s.timestamp,
      churn: Math.min(s.queueDepth, s.churnLimit),
      churnLimit: s.churnLimit,
    }))
    const maxChurn = Math.max(...bars.map((b) => b.churn), 1)
    return { bars, maxChurn }
  }, [samples, now])

  if (bars.length === 0) {
    return (
      <div className="flex h-28 items-center justify-center rounded-xl bg-slate-950/60 text-sm text-slate-400">
        Building churn rate history…
      </div>
    )
  }

  const n = bars.length
  const barW = VIEW_W / n

  return (
    <div className="relative space-y-1">
      <p className="text-[11px] uppercase tracking-wide text-slate-500">
        Churn rate · last 7 days
      </p>
      <div className="relative">
        <svg
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
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
          aria-label="Validator churn rate bar chart over last 7 days"
        >
          {bars.map((bar, i) => {
            const barH = (bar.churn / maxChurn) * VIEW_H
            return (
              <rect
                key={bar.epoch}
                x={i * barW + 0.5}
                y={VIEW_H - barH}
                width={Math.max(1, barW - 1)}
                height={barH}
                fill="#a78bfa"
                opacity={hover === null || hover === i ? 1 : 0.4}
                vectorEffect="non-scaling-stroke"
              />
            )
          })}
        </svg>

        {/* Tooltip */}
        {hover !== null && bars[hover] && (
          <div className="pointer-events-none absolute left-2 top-2 rounded-md border border-white/10 bg-slate-950/95 px-3 py-2 text-xs text-slate-100">
            <div className="font-semibold">Epoch {bars[hover].epoch.toLocaleString()}</div>
            <div className="text-violet-400">
              Processed: {bars[hover].churn.toLocaleString()} validators
            </div>
            <div className="text-slate-400">
              Churn limit: {bars[hover].churnLimit.toLocaleString()}/epoch
            </div>
            <div className="text-slate-500">
              {new Date(bars[hover].timestamp).toLocaleString(undefined, {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center gap-1.5 text-[11px] text-slate-600">
        <span
          className="inline-block h-2 w-2 rounded-sm"
          style={{ backgroundColor: '#a78bfa' }}
        />
        Validators processed per epoch
      </div>
    </div>
  )
}
