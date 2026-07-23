'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { BUCKET_COUNT, MAX_DELAY, type DelayHistogram } from '@/src/utils/histogramBinner'

const DISPLAY_HEIGHT = 280
const MARGIN = { top: 16, right: 16, bottom: 36, left: 48 }
const COLOR_OPTIMAL = '#22c55e'
const COLOR_FAIR = '#f59e0b'
const COLOR_POOR = '#ef4444'
const COLOR_AXIS = '#475569'
const COLOR_TEXT = '#94a3b8'

function barColor(delay: number): string {
  if (delay <= 1) return COLOR_OPTIMAL
  if (delay <= 3) return COLOR_FAIR
  return COLOR_POOR
}

function clamp(value: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, value))
}

function niceMax(value: number): number {
  if (value <= 0) return 1
  const pow = Math.pow(10, Math.floor(Math.log10(value)))
  const norm = value / pow
  const step = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10
  return step * pow
}

interface Hover {
  bucket: number
  px: number
  py: number
}

/**
 * Canvas-rendered attestation inclusion-delay histogram (33 buckets, 0..32
 * slots). The full chart is redrawn each paint — only 33 bars plus axes, so it
 * stays well within 60 FPS even with the largest configured epoch range. A
 * crosshair tooltip reports the exact count and percentage for the hovered
 * bucket.
 */
export function DelayHistogram({
  histogram,
  fromEpoch,
  toEpoch,
  isComputing = false,
}: {
  histogram: DelayHistogram | null
  fromEpoch: number
  toEpoch: number
  isComputing?: boolean
}) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [size, setSize] = useState({ w: 0, h: DISPLAY_HEIGHT })
  const [hover, setHover] = useState<Hover | null>(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const update = () => setSize({ w: el.clientWidth, h: DISPLAY_HEIGHT })
    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const plotW = Math.max(0, size.w - MARGIN.left - MARGIN.right)
  const plotH = Math.max(0, size.h - MARGIN.top - MARGIN.bottom)
  const barSlot = plotW / BUCKET_COUNT

  const paint = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas || size.w === 0) return
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1
    canvas.width = Math.round(size.w * dpr)
    canvas.height = Math.round(size.h * dpr)
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, size.w, size.h)

    const counts = histogram?.counts ?? new Array(BUCKET_COUNT).fill(0)
    const yMax = niceMax(histogram?.maxCount ?? 0)

    // y-axis grid + labels.
    ctx.strokeStyle = 'rgba(71,85,105,0.25)'
    ctx.fillStyle = COLOR_TEXT
    ctx.lineWidth = 1
    ctx.font = '10px ui-sans-serif, system-ui, sans-serif'
    ctx.textAlign = 'right'
    ctx.textBaseline = 'middle'
    const yTicks = 4
    for (let t = 0; t <= yTicks; t++) {
      const value = (yMax / yTicks) * t
      const y = MARGIN.top + plotH - (value / yMax) * plotH
      ctx.beginPath()
      ctx.moveTo(MARGIN.left, y + 0.5)
      ctx.lineTo(MARGIN.left + plotW, y + 0.5)
      ctx.stroke()
      ctx.fillText(String(Math.round(value)), MARGIN.left - 6, y)
    }

    // Bars.
    for (let b = 0; b < BUCKET_COUNT; b++) {
      const count = counts[b]
      const h = yMax > 0 ? (count / yMax) * plotH : 0
      const x = MARGIN.left + b * barSlot
      const y = MARGIN.top + plotH - h
      ctx.fillStyle = barColor(b)
      ctx.globalAlpha = hover && hover.bucket === b ? 1 : 0.82
      ctx.fillRect(x + 1, y, Math.max(1, barSlot - 2), h)
      ctx.globalAlpha = 1
    }

    // x-axis baseline + labels (every 4 slots).
    ctx.strokeStyle = COLOR_AXIS
    ctx.beginPath()
    ctx.moveTo(MARGIN.left, MARGIN.top + plotH + 0.5)
    ctx.lineTo(MARGIN.left + plotW, MARGIN.top + plotH + 0.5)
    ctx.stroke()
    ctx.fillStyle = COLOR_TEXT
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    for (let b = 0; b <= MAX_DELAY; b += 4) {
      const x = MARGIN.left + b * barSlot + barSlot / 2
      ctx.fillText(String(b), x, MARGIN.top + plotH + 8)
    }
    ctx.fillText('inclusion delay (slots)', MARGIN.left + plotW / 2, MARGIN.top + plotH + 22)

    // Crosshair on hovered bucket.
    if (hover) {
      const x = MARGIN.left + hover.bucket * barSlot + barSlot / 2
      ctx.strokeStyle = 'rgba(248,250,252,0.7)'
      ctx.setLineDash([3, 3])
      ctx.beginPath()
      ctx.moveTo(x, MARGIN.top)
      ctx.lineTo(x, MARGIN.top + plotH)
      ctx.stroke()
      ctx.setLineDash([])
    }
  }, [histogram, size, plotW, plotH, barSlot, hover])

  useEffect(() => {
    paint()
  }, [paint])

  const onMouseMove = useCallback(
    (event: React.MouseEvent<HTMLCanvasElement>) => {
      const rect = event.currentTarget.getBoundingClientRect()
      const mx = event.clientX - rect.left
      const my = event.clientY - rect.top
      if (mx < MARGIN.left || mx > MARGIN.left + plotW) {
        setHover(null)
        return
      }
      const bucket = clamp(Math.floor((mx - MARGIN.left) / barSlot), 0, BUCKET_COUNT - 1)
      setHover({ bucket, px: mx, py: my })
    },
    [plotW, barSlot],
  )

  const onMouseLeave = useCallback(() => setHover(null), [])

  const hoveredCount = hover && histogram ? histogram.counts[hover.bucket] : 0
  const hoveredPct = hover && histogram ? histogram.percentages[hover.bucket] : 0

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs text-slate-400">
        <span>
          Epochs {fromEpoch}–{toEpoch} · {histogram?.total ?? 0} attestations
        </span>
        <span>{isComputing ? 'Computing…' : `mean delay ${(histogram?.meanDelay ?? 0).toFixed(2)} slots`}</span>
      </div>

      <div ref={containerRef} className="relative w-full" style={{ height: DISPLAY_HEIGHT }}>
        <canvas
          ref={canvasRef}
          onMouseMove={onMouseMove}
          onMouseLeave={onMouseLeave}
          className="h-full w-full cursor-crosshair rounded-xl bg-slate-950/60"
          style={{ width: '100%', height: DISPLAY_HEIGHT }}
        />

        {hover && histogram && (
          <div
            className="pointer-events-none absolute z-10 rounded-md border border-white/10 bg-slate-950/95 px-2.5 py-1.5 text-xs text-slate-100 shadow-lg"
            style={{
              left: clamp(hover.px + 12, 0, Math.max(0, size.w - 150)),
              top: clamp(hover.py - 8, 0, Math.max(0, size.h - 64)),
            }}
          >
            <div className="font-semibold">
              {hover.bucket} slot{hover.bucket === 1 ? '' : 's'} delay
            </div>
            <div className="text-slate-400">Count: {hoveredCount.toLocaleString()}</div>
            <div className="text-slate-400">Share: {hoveredPct.toFixed(2)}%</div>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-4 text-xs text-slate-400">
        <Legend color={COLOR_OPTIMAL} label="Optimal (≤1)" />
        <Legend color={COLOR_FAIR} label="Fair (2–3)" />
        <Legend color={COLOR_POOR} label="Poor (>3)" />
      </div>
    </div>
  )
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="inline-block h-3 w-3 rounded-sm" style={{ backgroundColor: color }} />
      {label}
    </span>
  )
}
