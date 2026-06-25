'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  SHARD_COUNT,
  type CommitteeLayout,
  type CommitteeLayoutResponse,
  type EpochAssignments,
  type NodePosition,
} from '@/src/types/committee'
import { shardColor, shardColorAlpha } from '@/src/utils/shardColorMapping'

const DISPLAY_HEIGHT = 380
const GRID_COLS = 8
const GRID_ROWS = 8
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5))

type View =
  | { tier: 'cluster' }
  | { tier: 'shard'; shard: number }
  | { tier: 'detail'; validatorIndex: number }

interface Hover {
  node: NodePosition
  px: number
  py: number
}

function createWorker(): Worker | null {
  try {
    return new Worker(new URL('../../workers/committeeLayoutWorker.ts', import.meta.url))
  } catch {
    return null
  }
}

/** Main-thread layout fallback mirroring the worker (used when no Worker). */
function computeLayoutFallback(
  epoch: number,
  width: number,
  height: number,
  assignments: Array<{ validatorIndex: number; shard: number }>,
): CommitteeLayout {
  const cellW = width / GRID_COLS
  const cellH = height / GRID_ROWS
  const counts = new Array<number>(SHARD_COUNT).fill(0)
  for (const a of assignments) if (a.shard >= 0 && a.shard < SHARD_COUNT) counts[a.shard]++

  const centroids = Array.from({ length: SHARD_COUNT }, (_, s) => ({
    shard: s,
    x: (s % GRID_COLS) * cellW + cellW / 2,
    y: Math.floor(s / GRID_COLS) * cellH + cellH / 2,
    count: counts[s],
  }))

  const baseRadius = Math.min(cellW, cellH) * 0.12
  const perShardIndex = new Array<number>(SHARD_COUNT).fill(0)
  const nodes: NodePosition[] = assignments.map((a) => {
    const centroid = centroids[a.shard] ?? { x: width / 2, y: height / 2 }
    const i = a.shard >= 0 && a.shard < SHARD_COUNT ? perShardIndex[a.shard]++ : 0
    const radius = baseRadius * Math.sqrt(i + 1)
    const theta = i * GOLDEN_ANGLE
    return {
      validatorIndex: a.validatorIndex,
      shard: a.shard,
      x: centroid.x + radius * Math.cos(theta),
      y: centroid.y + radius * Math.sin(theta),
    }
  })
  return { epoch, width, height, nodes, centroids }
}

/**
 * Interactive shard-assignment topology map with three zoom tiers:
 *   cluster → all 64 shards   shard → one shard's validators   detail → one
 * validator's shard timeline. Layout is computed off-thread (worker) and the
 * cluster tier is cached to an offscreen canvas for smooth hover at scale.
 */
export function CommitteeTopologyMap({
  current,
  getValidatorTimeline,
}: {
  current: EpochAssignments | null
  getValidatorTimeline: (validatorIndex: number) => Array<{ epoch: number; shard: number }>
}) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const offscreenRef = useRef<HTMLCanvasElement | null>(null)
  const workerRef = useRef<Worker | null>(null)
  const requestIdRef = useRef(0)
  const pendingRef = useRef<string | null>(null)

  const [size, setSize] = useState({ w: 0, h: DISPLAY_HEIGHT })
  const [layout, setLayout] = useState<CommitteeLayout | null>(null)
  const [view, setView] = useState<View>({ tier: 'cluster' })
  const [hover, setHover] = useState<Hover | null>(null)

  const assignmentKey = useMemo(
    () => (current ? `${current.epoch}:${current.assignments.length}` : ''),
    [current],
  )

  // Worker lifecycle.
  useEffect(() => {
    const worker = createWorker()
    workerRef.current = worker
    const handler = (e: MessageEvent<CommitteeLayoutResponse>) => {
      const msg = e.data
      if (msg.payload.requestId !== pendingRef.current) return
      if (msg.type === 'LAYOUT') setLayout(msg.payload.layout)
    }
    worker?.addEventListener('message', handler)
    return () => {
      worker?.removeEventListener('message', handler)
      worker?.terminate()
    }
  }, [])

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

  // Compute layout (worker, or main-thread fallback) when data/size change.
  useEffect(() => {
    if (!current || size.w === 0) return
    const payload = current.assignments.map((a) => ({ validatorIndex: a.validatorIndex, shard: a.shard }))
    const worker = workerRef.current
    if (worker) {
      const requestId = `layout-${++requestIdRef.current}`
      pendingRef.current = requestId
      worker.postMessage({
        type: 'LAYOUT',
        payload: { requestId, epoch: current.epoch, width: size.w, height: size.h, assignments: payload },
      })
      return
    }

    // No worker: compute on the main thread, deferred so the state update lands
    // in a callback rather than synchronously in the effect body.
    const raf = requestAnimationFrame(() =>
      setLayout(computeLayoutFallback(current.epoch, size.w, size.h, payload)),
    )
    return () => cancelAnimationFrame(raf)
  }, [assignmentKey, current, size])

  // Render the cluster tier to an offscreen canvas (cached; redrawn on change).
  useEffect(() => {
    if (size.w === 0 || !layout || view.tier !== 'cluster') return
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

    const cellW = size.w / GRID_COLS
    const cellH = size.h / GRID_ROWS
    // Shard cells.
    for (const centroid of layout.centroids) {
      const col = centroid.shard % GRID_COLS
      const row = Math.floor(centroid.shard / GRID_COLS)
      const x = col * cellW
      const y = row * cellH
      ctx.fillStyle = centroid.count > 0 ? shardColorAlpha(centroid.shard, 0.08) : 'rgba(148,163,184,0.04)'
      ctx.fillRect(x + 1, y + 1, cellW - 2, cellH - 2)
      ctx.fillStyle = 'rgba(148,163,184,0.5)'
      ctx.font = '9px ui-sans-serif, system-ui, sans-serif'
      ctx.textAlign = 'left'
      ctx.textBaseline = 'top'
      ctx.fillText(`S${centroid.shard}`, x + 4, y + 4)
    }
    // Nodes.
    for (const node of layout.nodes) {
      ctx.beginPath()
      ctx.arc(node.x, node.y, 4, 0, Math.PI * 2)
      ctx.fillStyle = shardColor(node.shard)
      ctx.fill()
    }
  }, [layout, size, view])

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

    if (view.tier === 'cluster') {
      const offscreen = offscreenRef.current
      if (offscreen) ctx.drawImage(offscreen, 0, 0, size.w, size.h)
      if (hover) {
        ctx.beginPath()
        ctx.arc(hover.node.x, hover.node.y, 7, 0, Math.PI * 2)
        ctx.strokeStyle = '#f8fafc'
        ctx.lineWidth = 2
        ctx.stroke()
      }
      return
    }

    if (view.tier === 'shard' && layout) {
      const shardNodes = layout.nodes.filter((n) => n.shard === view.shard)
      const cx = size.w / 2
      const cy = size.h / 2
      const baseR = Math.min(size.w, size.h) * 0.06
      ctx.fillStyle = shardColorAlpha(view.shard, 0.1)
      ctx.fillRect(0, 0, size.w, size.h)
      shardNodes.forEach((node, i) => {
        const r = baseR * Math.sqrt(i + 1)
        const theta = i * GOLDEN_ANGLE
        const x = cx + r * Math.cos(theta)
        const y = cy + r * Math.sin(theta)
        ctx.beginPath()
        ctx.arc(x, y, 9, 0, Math.PI * 2)
        ctx.fillStyle = shardColor(view.shard)
        ctx.fill()
        ctx.fillStyle = '#0f172a'
        ctx.font = '8px ui-sans-serif, system-ui, sans-serif'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(String(node.validatorIndex), x, y)
      })
      return
    }

    if (view.tier === 'detail') {
      const timeline = getValidatorTimeline(view.validatorIndex)
      if (timeline.length === 0) return
      const padX = 32
      const usableW = size.w - padX * 2
      const trackY = size.h / 2
      ctx.strokeStyle = 'rgba(148,163,184,0.25)'
      ctx.beginPath()
      ctx.moveTo(padX, trackY)
      ctx.lineTo(size.w - padX, trackY)
      ctx.stroke()
      timeline.forEach((point, i) => {
        const x = padX + (timeline.length === 1 ? usableW / 2 : (i / (timeline.length - 1)) * usableW)
        // y position varies with shard so shard changes are visible.
        const y = trackY + ((point.shard / SHARD_COUNT) * 2 - 1) * (size.h * 0.32)
        ctx.beginPath()
        ctx.arc(x, y, 5, 0, Math.PI * 2)
        ctx.fillStyle = shardColor(point.shard)
        ctx.fill()
      })
    }
  }, [view, layout, hover, size, getValidatorTimeline])

  useEffect(() => {
    paint()
  }, [paint])

  const nodeAt = useCallback(
    (px: number, py: number): NodePosition | null => {
      if (!layout) return null
      let best: NodePosition | null = null
      let bestDist = 8 * 8
      for (const node of layout.nodes) {
        const dx = node.x - px
        const dy = node.y - py
        const d = dx * dx + dy * dy
        if (d < bestDist) {
          bestDist = d
          best = node
        }
      }
      return best
    },
    [layout],
  )

  const onMouseMove = useCallback(
    (event: React.MouseEvent<HTMLCanvasElement>) => {
      if (view.tier !== 'cluster') {
        setHover(null)
        return
      }
      const rect = event.currentTarget.getBoundingClientRect()
      const px = event.clientX - rect.left
      const py = event.clientY - rect.top
      const node = nodeAt(px, py)
      setHover(node ? { node, px, py } : null)
    },
    [view, nodeAt],
  )

  const onClick = useCallback(
    (event: React.MouseEvent<HTMLCanvasElement>) => {
      const rect = event.currentTarget.getBoundingClientRect()
      const px = event.clientX - rect.left
      const py = event.clientY - rect.top

      if (view.tier === 'cluster') {
        const node = nodeAt(px, py)
        if (node) {
          setView({ tier: 'detail', validatorIndex: node.validatorIndex })
          setHover(null)
          return
        }
        const col = Math.floor(px / (size.w / GRID_COLS))
        const row = Math.floor(py / (size.h / GRID_ROWS))
        const shard = row * GRID_COLS + col
        if (shard >= 0 && shard < SHARD_COUNT) setView({ tier: 'shard', shard })
        return
      }
      if (view.tier === 'shard' && layout) {
        // Click a validator dot to drill into its timeline.
        const cx = size.w / 2
        const cy = size.h / 2
        const baseR = Math.min(size.w, size.h) * 0.06
        const shardNodes = layout.nodes.filter((n) => n.shard === view.shard)
        for (let i = 0; i < shardNodes.length; i++) {
          const r = baseR * Math.sqrt(i + 1)
          const theta = i * GOLDEN_ANGLE
          const x = cx + r * Math.cos(theta)
          const y = cy + r * Math.sin(theta)
          if ((x - px) ** 2 + (y - py) ** 2 < 11 * 11) {
            setView({ tier: 'detail', validatorIndex: shardNodes[i].validatorIndex })
            return
          }
        }
      }
    },
    [view, nodeAt, layout, size],
  )

  const breadcrumb =
    view.tier === 'cluster'
      ? 'All shards'
      : view.tier === 'shard'
        ? `Shard ${view.shard}`
        : `Validator #${view.validatorIndex}`

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs text-slate-400">
        <span>
          {breadcrumb}
          {current ? ` · epoch ${current.epoch} · ${current.assignments.length} validators` : ''}
        </span>
        {view.tier !== 'cluster' && (
          <button
            type="button"
            onClick={() => setView({ tier: 'cluster' })}
            className="rounded-md border border-white/10 px-2 py-1 font-medium text-slate-200 hover:bg-white/5"
          >
            ← Back to all shards
          </button>
        )}
      </div>

      <div ref={containerRef} className="relative w-full" style={{ height: DISPLAY_HEIGHT }}>
        <canvas
          ref={canvasRef}
          onMouseMove={onMouseMove}
          onMouseLeave={() => setHover(null)}
          onClick={onClick}
          className="h-full w-full cursor-pointer rounded-xl bg-slate-950/60"
          style={{ width: '100%', height: DISPLAY_HEIGHT }}
        />
        {hover && (
          <div
            className="pointer-events-none absolute z-10 rounded-md border border-white/10 bg-slate-950/95 px-2.5 py-1.5 text-xs text-slate-100 shadow-lg"
            style={{ left: Math.min(hover.px + 12, size.w - 140), top: Math.min(hover.py + 12, size.h - 48) }}
          >
            <div className="font-semibold">Validator #{hover.node.validatorIndex}</div>
            <div className="text-slate-400">Shard {hover.node.shard}</div>
          </div>
        )}
      </div>

      <p className="text-[11px] text-slate-500">
        Click a shard cell to zoom in · click a validator to see its shard timeline
      </p>
    </div>
  )
}
