'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  EPOCHS_PER_SYNC_COMMITTEE_PERIOD,
  SLOTS_PER_EPOCH,
  coordsToRelativeSlot,
  slotTimestampMs,
  type SyncCommitteePeriodData,
} from '@/src/utils/syncCommittee'

const DISPLAY_HEIGHT = 256
const COLOR_PARTICIPATED = '#22c55e'
const COLOR_MISSED = '#ef4444'
const COLOR_UNASSIGNED = '#334155'
const COLOR_GRID = 'rgba(15,23,42,0.6)'
const MIN_DRAG_PX = 5

interface ViewRange {
  e0: number
  e1: number
  s0: number
  s1: number
}

const FULL_VIEW: ViewRange = {
  e0: 0,
  e1: EPOCHS_PER_SYNC_COMMITTEE_PERIOD - 1,
  s0: 0,
  s1: SLOTS_PER_EPOCH - 1,
}

interface Hovered {
  epoch: number
  slot: number
  px: number
  py: number
}

interface DragRect {
  x0: number
  y0: number
  x1: number
  y1: number
}

function clamp(value: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, value))
}

function cellColor(period: SyncCommitteePeriodData, epoch: number, slot: number): string {
  if (!period.assigned || period.participation.length === 0) return COLOR_UNASSIGNED
  return period.participation[coordsToRelativeSlot(epoch, slot)] === 1
    ? COLOR_PARTICIPATED
    : COLOR_MISSED
}

export function SyncCommitteeHeatmap({ period }: { period: SyncCommitteePeriodData }) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const offscreenRef = useRef<HTMLCanvasElement | null>(null)
  const dragStartRef = useRef<{ x: number; y: number } | null>(null)

  const [view, setView] = useState<ViewRange>(FULL_VIEW)
  const [size, setSize] = useState({ w: 0, h: DISPLAY_HEIGHT })
  const [hovered, setHovered] = useState<Hovered | null>(null)
  const [dragRect, setDragRect] = useState<DragRect | null>(null)
  const [trackedPeriod, setTrackedPeriod] = useState(period.period)

  // Reset the view when the period changes (adjust state during render).
  if (period.period !== trackedPeriod) {
    setTrackedPeriod(period.period)
    setView(FULL_VIEW)
    setHovered(null)
  }

  // Track container width.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const update = () => setSize({ w: el.clientWidth, h: DISPLAY_HEIGHT })
    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const visibleEpochs = view.e1 - view.e0 + 1
  const visibleSlots = view.s1 - view.s0 + 1
  const cellW = size.w / visibleEpochs
  const cellH = size.h / visibleSlots

  // Render the full visible grid to an offscreen canvas (only on data/view/size change).
  useEffect(() => {
    if (size.w === 0) return
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1

    let offscreen = offscreenRef.current
    if (!offscreen) {
      offscreen = document.createElement('canvas')
      offscreenRef.current = offscreen
    }
    offscreen.width = Math.round(size.w * dpr)
    offscreen.height = Math.round(size.h * dpr)
    const ctx = offscreen.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, size.w, size.h)

    for (let e = view.e0; e <= view.e1; e++) {
      const x = (e - view.e0) * cellW
      for (let s = view.s0; s <= view.s1; s++) {
        const y = (s - view.s0) * cellH
        ctx.fillStyle = cellColor(period, e, s)
        ctx.fillRect(x, y, cellW + 0.5, cellH + 0.5)
      }
    }

    // Grid lines only when cells are large enough to read.
    if (cellW >= 8 && cellH >= 8) {
      ctx.strokeStyle = COLOR_GRID
      ctx.lineWidth = 1
      for (let e = view.e0; e <= view.e1 + 1; e++) {
        const x = Math.round((e - view.e0) * cellW) + 0.5
        ctx.beginPath()
        ctx.moveTo(x, 0)
        ctx.lineTo(x, size.h)
        ctx.stroke()
      }
      for (let s = view.s0; s <= view.s1 + 1; s++) {
        const y = Math.round((s - view.s0) * cellH) + 0.5
        ctx.beginPath()
        ctx.moveTo(0, y)
        ctx.lineTo(size.w, y)
        ctx.stroke()
      }
    }
  }, [period, view, size, cellW, cellH])

  // Composite offscreen + hover/selection overlays onto the visible canvas.
  const paint = useCallback(() => {
    const canvas = canvasRef.current
    const offscreen = offscreenRef.current
    if (!canvas || !offscreen || size.w === 0) return
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1
    if (canvas.width !== offscreen.width) canvas.width = offscreen.width
    if (canvas.height !== offscreen.height) canvas.height = offscreen.height

    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, size.w, size.h)
    ctx.drawImage(offscreen, 0, 0, size.w, size.h)

    if (hovered) {
      const x = (hovered.epoch - view.e0) * cellW
      const y = (hovered.slot - view.s0) * cellH
      ctx.strokeStyle = '#f8fafc'
      ctx.lineWidth = 2
      ctx.strokeRect(x + 1, y + 1, cellW - 2, cellH - 2)
    }

    if (dragRect) {
      const x = Math.min(dragRect.x0, dragRect.x1)
      const y = Math.min(dragRect.y0, dragRect.y1)
      const w = Math.abs(dragRect.x1 - dragRect.x0)
      const h = Math.abs(dragRect.y1 - dragRect.y0)
      ctx.fillStyle = 'rgba(56,189,248,0.18)'
      ctx.fillRect(x, y, w, h)
      ctx.strokeStyle = '#38bdf8'
      ctx.lineWidth = 1
      ctx.strokeRect(x + 0.5, y + 0.5, w, h)
    }
  }, [hovered, dragRect, view, size, cellW, cellH])

  useEffect(() => {
    paint()
  }, [paint])

  const cellAt = useCallback(
    (px: number, py: number) => {
      const epoch = clamp(view.e0 + Math.floor(px / cellW), view.e0, view.e1)
      const slot = clamp(view.s0 + Math.floor(py / cellH), view.s0, view.s1)
      return { epoch, slot }
    },
    [view, cellW, cellH],
  )

  const onMouseMove = useCallback(
    (event: React.MouseEvent<HTMLCanvasElement>) => {
      const rect = event.currentTarget.getBoundingClientRect()
      const px = clamp(event.clientX - rect.left, 0, size.w - 1)
      const py = clamp(event.clientY - rect.top, 0, size.h - 1)

      if (dragStartRef.current) {
        setDragRect({ x0: dragStartRef.current.x, y0: dragStartRef.current.y, x1: px, y1: py })
        return
      }

      const { epoch, slot } = cellAt(px, py)
      setHovered({ epoch, slot, px, py })
    },
    [cellAt, size],
  )

  const onMouseDown = useCallback((event: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    dragStartRef.current = { x: event.clientX - rect.left, y: event.clientY - rect.top }
    setHovered(null)
  }, [])

  const onMouseUp = useCallback(
    (event: React.MouseEvent<HTMLCanvasElement>) => {
      const start = dragStartRef.current
      dragStartRef.current = null
      setDragRect(null)
      if (!start) return

      const rect = event.currentTarget.getBoundingClientRect()
      const endX = clamp(event.clientX - rect.left, 0, size.w - 1)
      const endY = clamp(event.clientY - rect.top, 0, size.h - 1)
      if (Math.abs(endX - start.x) < MIN_DRAG_PX && Math.abs(endY - start.y) < MIN_DRAG_PX) return

      const a = cellAt(Math.min(start.x, endX), Math.min(start.y, endY))
      const b = cellAt(Math.max(start.x, endX), Math.max(start.y, endY))
      setView({
        e0: Math.min(a.epoch, b.epoch),
        e1: Math.max(a.epoch, b.epoch),
        s0: Math.min(a.slot, b.slot),
        s1: Math.max(a.slot, b.slot),
      })
    },
    [cellAt, size],
  )

  const onMouseLeave = useCallback(() => {
    setHovered(null)
    dragStartRef.current = null
    setDragRect(null)
  }, [])

  const resetView = useCallback(() => setView(FULL_VIEW), [])

  const isZoomed = visibleEpochs < EPOCHS_PER_SYNC_COMMITTEE_PERIOD || visibleSlots < SLOTS_PER_EPOCH

  const hoverStatus = hovered
    ? !period.assigned
      ? 'Not assigned'
      : period.participation[coordsToRelativeSlot(hovered.epoch, hovered.slot)] === 1
        ? 'Participated'
        : 'Missed'
    : ''

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs text-slate-400">
        <span>
          Epochs {view.e0}–{view.e1} · slots {view.s0}–{view.s1}
        </span>
        {isZoomed && (
          <button
            type="button"
            onClick={resetView}
            className="rounded-md border border-white/10 px-2 py-1 font-medium text-slate-200 hover:bg-white/5"
          >
            Reset zoom
          </button>
        )}
      </div>

      <div ref={containerRef} className="relative w-full" style={{ height: DISPLAY_HEIGHT }}>
        <canvas
          ref={canvasRef}
          onMouseMove={onMouseMove}
          onMouseDown={onMouseDown}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseLeave}
          onDoubleClick={resetView}
          className="h-full w-full cursor-crosshair rounded-xl bg-slate-950/60"
          style={{ width: '100%', height: DISPLAY_HEIGHT }}
        />

        {hovered && !dragRect && (
          <div
            className="pointer-events-none absolute z-10 rounded-md border border-white/10 bg-slate-950/95 px-2.5 py-1.5 text-xs text-slate-100 shadow-lg"
            style={{
              left: clamp(hovered.px + 12, 0, Math.max(0, size.w - 170)),
              top: clamp(hovered.py + 12, 0, Math.max(0, size.h - 70)),
            }}
          >
            <div className="font-semibold">
              Epoch {period.startEpoch + hovered.epoch} · Slot {hovered.slot}
            </div>
            <div className="text-slate-400">{hoverStatus}</div>
            <div className="text-slate-500">
              {new Date(
                slotTimestampMs(period.period, coordsToRelativeSlot(hovered.epoch, hovered.slot)),
              ).toUTCString()}
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-4 text-xs text-slate-400">
        <Legend color={COLOR_PARTICIPATED} label="Participated" />
        <Legend color={COLOR_MISSED} label="Missed" />
        <Legend color={COLOR_UNASSIGNED} label="Not assigned" />
        <span className="ml-auto text-slate-500">Drag to zoom · double-click to reset</span>
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
