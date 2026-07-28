'use client'

import { useMemo, useState } from 'react'
import { buildPeerHeightHistogram } from '@/src/utils/syncHistogram'
import type { PeerHeightBucket } from '@/src/types/sync'

interface PeerHeightHistogramProps {
  peerHeights: number[]
  currentHeight: number
  bucketCount?: number
}

const VIEW_W = 500
const VIEW_H = 120
const PADDING_LEFT = 8
const PADDING_RIGHT = 8
const PADDING_TOP = 8
const PADDING_BOTTOM = 24 // room for x-axis labels

/**
 * SVG bar chart showing the distribution of connected peers' block heights.
 * The local node's position is highlighted with a distinct colour and a
 * "You" label so operators can see at a glance how far behind they are.
 */
export function PeerHeightHistogram({
  peerHeights,
  currentHeight,
  bucketCount = 10,
}: PeerHeightHistogramProps) {
  const [hover, setHover] = useState<number | null>(null)

  const buckets: PeerHeightBucket[] = useMemo(
    () => buildPeerHeightHistogram(peerHeights, currentHeight, bucketCount),
    [peerHeights, currentHeight, bucketCount],
  )

  if (buckets.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center rounded-xl bg-slate-950/60 text-sm text-slate-500">
        No peer data available
      </div>
    )
  }

  const maxCount = Math.max(...buckets.map((b) => b.count), 1)
  const plotW = VIEW_W - PADDING_LEFT - PADDING_RIGHT
  const plotH = VIEW_H - PADDING_TOP - PADDING_BOTTOM
  const barWidth = plotW / buckets.length
  const gap = Math.max(1, barWidth * 0.12)

  return (
    <div className="space-y-1">
      <p className="text-[11px] uppercase tracking-wide text-slate-500">
        Peer block-height distribution
      </p>

      <div className="relative">
        <svg
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          preserveAspectRatio="none"
          className="h-36 w-full rounded-xl bg-slate-950/60"
          role="img"
          aria-label="Peer block-height histogram"
          onMouseLeave={() => setHover(null)}
        >
          {buckets.map((bucket, i) => {
            const barH = Math.max(2, (bucket.count / maxCount) * plotH)
            const x = PADDING_LEFT + i * barWidth + gap / 2
            const y = PADDING_TOP + plotH - barH
            const w = barWidth - gap
            const isHovered = hover === i
            const fill = bucket.isLocalNode
              ? '#f59e0b' // amber — local node position
              : '#38bdf8' // sky  — peers

            return (
              <g
                key={i}
                onMouseEnter={() => setHover(i)}
                style={{ cursor: 'pointer' }}
              >
                <rect
                  x={x}
                  y={y}
                  width={w}
                  height={barH}
                  fill={fill}
                  opacity={isHovered ? 1 : 0.75}
                  rx={2}
                  vectorEffect="non-scaling-stroke"
                />
                {/* "You" label above the local node's bar */}
                {bucket.isLocalNode && (
                  <text
                    x={x + w / 2}
                    y={y - 3}
                    textAnchor="middle"
                    fontSize={8}
                    fill="#f59e0b"
                    fontWeight="bold"
                    vectorEffect="non-scaling-stroke"
                  >
                    You
                  </text>
                )}
                {/* x-axis label: first bucket, last bucket, local bucket */}
                {(i === 0 || i === buckets.length - 1 || bucket.isLocalNode) && (
                  <text
                    x={x + w / 2}
                    y={VIEW_H - 6}
                    textAnchor="middle"
                    fontSize={7}
                    fill="#64748b"
                    vectorEffect="non-scaling-stroke"
                  >
                    {(bucket.from / 1_000).toFixed(0)}k
                  </text>
                )}
              </g>
            )
          })}
        </svg>

        {/* Tooltip */}
        {hover !== null && buckets[hover] && (
          <div className="pointer-events-none absolute left-2 top-2 rounded-md border border-white/10 bg-slate-950/95 px-3 py-2 text-xs text-slate-100">
            <div className="font-semibold">
              {buckets[hover].from.toLocaleString()} – {buckets[hover].to.toLocaleString()}
            </div>
            <div className="text-sky-300">
              {buckets[hover].count} peer{buckets[hover].count !== 1 ? 's' : ''}
            </div>
            {buckets[hover].isLocalNode && (
              <div className="text-amber-400">← Your node</div>
            )}
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="flex gap-4 text-xs text-slate-400">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-sky-400/80" />
          Peers
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-amber-400/80" />
          Your node
        </span>
      </div>
    </div>
  )
}
