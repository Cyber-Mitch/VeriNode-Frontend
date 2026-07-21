'use client'

import { useMemo } from 'react'

const VIEW_W = 300

/**
 * Lightweight SVG sparkline: the raw series (faint) with its EWMA overlay
 * (bold). Shared min/max scaling keeps the two lines comparable. Adapted for
 * exit-queue churn/depth trends.
 */
export function EWMATrendline({
  values,
  ewma,
  height = 64,
  color = '#38bdf8',
  label,
}: {
  values: number[]
  ewma?: number[]
  height?: number
  color?: string
  label?: string
}) {
  const { rawPoints, ewmaPoints } = useMemo(() => {
    if (values.length < 2) return { rawPoints: '', ewmaPoints: '' }

    const all = ewma && ewma.length ? values.concat(ewma) : values
    const min = Math.min(...all)
    const max = Math.max(...all)
    const span = max - min || 1

    const toPoints = (series: number[]): string => {
      const n = series.length
      if (n < 2) return ''
      return series
        .map((v, i) => {
          const x = (i / (n - 1)) * VIEW_W
          const y = height - ((v - min) / span) * height
          return `${x.toFixed(2)},${y.toFixed(2)}`
        })
        .join(' ')
    }

    return { rawPoints: toPoints(values), ewmaPoints: ewma ? toPoints(ewma) : '' }
  }, [values, ewma, height])

  return (
    <div className="space-y-1">
      {label && <p className="text-[11px] uppercase tracking-wide text-slate-500">{label}</p>}
      <svg
        viewBox={`0 0 ${VIEW_W} ${height}`}
        preserveAspectRatio="none"
        className="h-16 w-full rounded-lg bg-slate-950/60"
        role="img"
        aria-label={label ?? 'trend'}
      >
        {rawPoints ? (
          <>
            <polyline
              points={rawPoints}
              fill="none"
              stroke={color}
              strokeOpacity={0.3}
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
            {ewmaPoints && (
              <polyline
                points={ewmaPoints}
                fill="none"
                stroke={color}
                strokeWidth={2}
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            )}
          </>
        ) : (
          <line
            x1={0}
            y1={height / 2}
            x2={VIEW_W}
            y2={height / 2}
            stroke="#334155"
            strokeDasharray="4 4"
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>
    </div>
  )
}
