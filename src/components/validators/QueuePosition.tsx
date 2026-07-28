'use client'

import { useMemo } from 'react'

const GAUGE_R = 46
const GAUGE_CIRCUMFERENCE = 2 * Math.PI * GAUGE_R

/**
 * SVG arc gauge: shows the validator's position within the total queue depth.
 * Arc fill represents the fraction of the queue still ahead of this validator —
 * the smaller the arc, the closer to the front.
 */
export function QueuePosition({
  position,
  queueDepth,
  epochsRemaining,
  projectedExitTimestamp,
}: {
  position: number
  queueDepth: number
  epochsRemaining: number | null
  projectedExitTimestamp: number | null
}) {
  const ratio = useMemo(() => {
    if (queueDepth <= 0) return 0
    return Math.min(1, position / queueDepth)
  }, [position, queueDepth])

  const dashOffset = GAUGE_CIRCUMFERENCE - ratio * GAUGE_CIRCUMFERENCE

  const eta = useMemo(() => {
    if (projectedExitTimestamp === null) return null
    const ms = projectedExitTimestamp - Date.now()
    if (ms <= 0) return 'imminent'
    const minutes = ms / 60_000
    if (minutes < 60) return `${Math.round(minutes)} min`
    const hours = minutes / 60
    if (hours < 48) return `${hours.toFixed(1)} h`
    const days = hours / 24
    return `${days.toFixed(1)} d`
  }, [projectedExitTimestamp])

  // Color: green when near front, amber mid-queue, red at the back.
  const color = ratio < 0.2 ? '#22c55e' : ratio < 0.6 ? '#f59e0b' : '#ef4444'

  return (
    <div className="flex flex-col items-center gap-3">
      <svg
        viewBox="0 0 120 120"
        className="h-36 w-36 -rotate-90"
        aria-label={`Queue position gauge: ${position.toLocaleString()} of ${queueDepth.toLocaleString()}`}
        role="img"
      >
        {/* Track */}
        <circle
          cx="60"
          cy="60"
          r={GAUGE_R}
          fill="none"
          stroke="#1e293b"
          strokeWidth="12"
        />
        {/* Fill */}
        <circle
          cx="60"
          cy="60"
          r={GAUGE_R}
          fill="none"
          stroke={color}
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={GAUGE_CIRCUMFERENCE}
          strokeDashoffset={dashOffset}
          className="transition-all duration-500 ease-out"
        />
      </svg>

      {/* Centre label overlay */}
      <div className="absolute flex flex-col items-center justify-center" style={{ lineHeight: 1 }}>
        <span className="text-2xl font-bold text-white">
          {position.toLocaleString()}
        </span>
        <span className="text-[11px] text-slate-400">in queue</span>
      </div>

      <div className="mt-1 text-center">
        <p className="text-sm font-semibold text-slate-200">
          {position.toLocaleString()} / {queueDepth.toLocaleString()}
        </p>
        <p className="text-xs text-slate-500">
          position · total depth
        </p>
        {eta !== null && (
          <p className="mt-1 text-xs font-medium" style={{ color }}>
            ETA: {eta}
            {epochsRemaining !== null && ` · ${epochsRemaining.toLocaleString()} epochs`}
          </p>
        )}
      </div>
    </div>
  )
}
