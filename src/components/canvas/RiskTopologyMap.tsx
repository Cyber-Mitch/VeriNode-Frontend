'use client'

// Equirectangular canvas map for correlated slashing risk topology.
//
// Features:
//   • Up to 500 nodes rendered as dots colored by risk tier
//   • Cluster convex-hull polygons (semi-transparent fill)
//   • Zoom / pan via mouse wheel and drag
//   • Click cluster → fire onSelectCluster callback
//   • Offscreen canvas caches the static world outline layer

import { useCallback, useEffect, useRef, useState } from 'react'
import type { RiskNode, ClusterRiskResult } from '@/src/store/riskSlice'
import type { RiskTier } from '@/src/utils/riskScore'

const DISPLAY_HEIGHT = 420
const MAX_NODES = 500

/** Pixel color per risk tier. */
const TIER_COLOR: Record<RiskTier | 'noise', string> = {
  low: '#22c55e',
  medium: '#f59e0b',
  high: '#f97316',
  critical: '#ef4444',
  noise: '#64748b',
}

const TIER_COLOR_ALPHA: Record<RiskTier | 'noise', string> = {
  low: 'rgba(34,197,94,0.15)',
  medium: 'rgba(245,158,11,0.15)',
  high: 'rgba(249,115,22,0.15)',
  critical: 'rgba(239,68,68,0.15)',
  noise: 'rgba(100,116,139,0.10)',
}

interface Transform {
  /** Zoom scale (1 = fit full map). */
  scale: number
  /** Translation in logical map pixels. */
  tx: number
  ty: number
}

const INITIAL_TRANSFORM: Transform = { scale: 1, tx: 0, ty: 0 }

// ── Equirectangular projection ────────────────────────────────────────────────

function lngLatToXY(lng: number, lat: number, w: number, h: number): [number, number] {
  const x = ((lng + 180) / 360) * w
  const y = ((90 - lat) / 180) * h
  return [x, y]
}

// ── Convex hull (Graham scan) ─────────────────────────────────────────────────

function cross(o: [number, number], a: [number, number], b: [number, number]): number {
  return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
}

function convexHull(pts: Array<[number, number]>): Array<[number, number]> {
  const n = pts.length
  if (n < 3) return pts
  const sorted = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1])
  const lower: Array<[number, number]> = []
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0)
      lower.pop()
    lower.push(p)
  }
  const upper: Array<[number, number]> = []
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i]
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0)
      upper.pop()
    upper.push(p)
  }
  upper.pop()
  lower.pop()
  return [...lower, ...upper]
}

// ── Component ────────────────────────────────────────────────────────────────

interface Hover {
  nodeId: string
  tier: RiskTier | 'noise'
  clusterId: number
  px: number
  py: number
}

export interface RiskTopologyMapProps {
  nodes: RiskNode[]
  clusters: ClusterRiskResult[]
  /** Called when user clicks a cluster hull or node dot. */
  onSelectCluster?: (clusterId: number) => void
}

export function RiskTopologyMap({ nodes, clusters, onSelectCluster }: RiskTopologyMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const offscreenRef = useRef<HTMLCanvasElement | null>(null)

  const [size, setSize] = useState({ w: 0, h: DISPLAY_HEIGHT })
  const [transform, setTransform] = useState<Transform>(INITIAL_TRANSFORM)
  const [hover, setHover] = useState<Hover | null>(null)

  const dragRef = useRef<{ startX: number; startY: number; origTx: number; origTy: number } | null>(null)

  // Limit to MAX_NODES.
  const visibleNodes = nodes.slice(0, MAX_NODES)

  // ── Resize observer ─────────────────────────────────────────────────────────
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const update = () => setSize({ w: el.clientWidth, h: DISPLAY_HEIGHT })
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // ── Cluster lookup map ──────────────────────────────────────────────────────
  const clusterByIdRef = useRef<Map<number, ClusterRiskResult>>(new Map())
  useEffect(() => {
    clusterByIdRef.current = new Map(clusters.map((c) => [c.clusterId, c]))
  }, [clusters])

  // ── Projection helpers (scoped to current size) ─────────────────────────────
  const project = useCallback(
    (lng: number, lat: number, t: Transform): [number, number] => {
      const [mx, my] = lngLatToXY(lng, lat, size.w, size.h)
      return [mx * t.scale + t.tx, my * t.scale + t.ty]
    },
    [size],
  )

  // ── Build convex hulls for clusters ─────────────────────────────────────────
  const hullsRef = useRef<Map<number, Array<[number, number]>>>(new Map())
  useEffect(() => {
    const map = new Map<number, Array<[number, number]>>()
    const clusterPts = new Map<number, Array<[number, number]>>()
    for (const node of visibleNodes) {
      if (node.clusterId < 0) continue
      const pts = clusterPts.get(node.clusterId) ?? []
      pts.push([node.lng, node.lat])
      clusterPts.set(node.clusterId, pts)
    }
    for (const [cid, pts] of clusterPts) {
      map.set(cid, convexHull(pts))
    }
    hullsRef.current = map
  }, [visibleNodes])

  // ── Offscreen world grid (redrawn on size change) ───────────────────────────
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

    // Background.
    ctx.fillStyle = '#0c1627'
    ctx.fillRect(0, 0, size.w, size.h)

    // Graticule lines every 30°.
    ctx.strokeStyle = 'rgba(148,163,184,0.07)'
    ctx.lineWidth = 0.5
    for (let lng = -180; lng <= 180; lng += 30) {
      const x = ((lng + 180) / 360) * size.w
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, size.h)
      ctx.stroke()
    }
    for (let lat = -90; lat <= 90; lat += 30) {
      const y = ((90 - lat) / 180) * size.h
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(size.w, y)
      ctx.stroke()
    }

    // Equator & prime meridian.
    ctx.strokeStyle = 'rgba(148,163,184,0.18)'
    ctx.lineWidth = 0.8
    const equatorY = size.h / 2
    ctx.beginPath()
    ctx.moveTo(0, equatorY)
    ctx.lineTo(size.w, equatorY)
    ctx.stroke()
    const meridianX = size.w / 2
    ctx.beginPath()
    ctx.moveTo(meridianX, 0)
    ctx.lineTo(meridianX, size.h)
    ctx.stroke()
  }, [size])

  // ── Main paint ───────────────────────────────────────────────────────────────
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

    // Composite offscreen world background.
    const offscreen = offscreenRef.current
    if (offscreen) {
      ctx.save()
      ctx.translate(transform.tx, transform.ty)
      ctx.scale(transform.scale, transform.scale)
      ctx.drawImage(offscreen, 0, 0, size.w, size.h)
      ctx.restore()
    }

    // Draw cluster convex hulls.
    for (const [cid, hull] of hullsRef.current) {
      if (hull.length < 2) continue
      const cluster = clusterByIdRef.current.get(cid)
      const tier = cluster?.tier ?? 'noise'
      const projected = hull.map(([lng, lat]) => project(lng, lat, transform))

      ctx.beginPath()
      const [fx, fy] = projected[0]
      ctx.moveTo(fx, fy)
      for (let i = 1; i < projected.length; i++) {
        ctx.lineTo(projected[i][0], projected[i][1])
      }
      ctx.closePath()
      ctx.fillStyle = TIER_COLOR_ALPHA[tier]
      ctx.fill()
      ctx.strokeStyle = TIER_COLOR[tier]
      ctx.lineWidth = 1.5
      ctx.globalAlpha = 0.5
      ctx.stroke()
      ctx.globalAlpha = 1
    }

    // Draw node dots.
    for (const node of visibleNodes) {
      const [px, py] = project(node.lng, node.lat, transform)
      const cluster = node.clusterId >= 0 ? clusterByIdRef.current.get(node.clusterId) : undefined
      const tier = cluster?.tier ?? 'noise'
      const isHovered = hover?.nodeId === node.nodeId
      const radius = isHovered ? 7 : 4

      ctx.beginPath()
      ctx.arc(px, py, radius, 0, Math.PI * 2)
      ctx.fillStyle = TIER_COLOR[tier]
      ctx.fill()
      if (isHovered) {
        ctx.strokeStyle = '#f8fafc'
        ctx.lineWidth = 2
        ctx.stroke()
      }
    }
  }, [size, transform, visibleNodes, hover, project])

  useEffect(() => {
    paint()
  }, [paint])

  // ── Hit-test ─────────────────────────────────────────────────────────────────
  const nodeAt = useCallback(
    (px: number, py: number): RiskNode | null => {
      let best: RiskNode | null = null
      let bestDist = 10 * 10
      for (const node of visibleNodes) {
        const [nx, ny] = project(node.lng, node.lat, transform)
        const d = (nx - px) ** 2 + (ny - py) ** 2
        if (d < bestDist) {
          bestDist = d
          best = node
        }
      }
      return best
    },
    [visibleNodes, project, transform],
  )

  // ── Mouse events ──────────────────────────────────────────────────────────────
  const onMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (dragRef.current) {
        const dx = e.clientX - dragRef.current.startX
        const dy = e.clientY - dragRef.current.startY
        setTransform((t) => ({
          ...t,
          tx: dragRef.current!.origTx + dx,
          ty: dragRef.current!.origTy + dy,
        }))
        return
      }
      const rect = e.currentTarget.getBoundingClientRect()
      const px = e.clientX - rect.left
      const py = e.clientY - rect.top
      const node = nodeAt(px, py)
      if (node) {
        const cluster = node.clusterId >= 0 ? clusterByIdRef.current.get(node.clusterId) : undefined
        setHover({
          nodeId: node.nodeId,
          tier: cluster?.tier ?? 'noise',
          clusterId: node.clusterId,
          px,
          py,
        })
      } else {
        setHover(null)
      }
    },
    [nodeAt],
  )

  const onMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      origTx: 0,
      origTy: 0,
    }
    // Capture current transform values.
    setTransform((t) => {
      dragRef.current!.origTx = t.tx
      dragRef.current!.origTy = t.ty
      return t
    })
  }, [])

  const onMouseUp = useCallback(() => {
    dragRef.current = null
  }, [])

  const onMouseLeave = useCallback(() => {
    dragRef.current = null
    setHover(null)
  }, [])

  const onClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const rect = e.currentTarget.getBoundingClientRect()
      const px = e.clientX - rect.left
      const py = e.clientY - rect.top
      const node = nodeAt(px, py)
      if (node && node.clusterId >= 0 && onSelectCluster) {
        onSelectCluster(node.clusterId)
      }
    },
    [nodeAt, onSelectCluster],
  )

  const onWheel = useCallback((e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15
    setTransform((t) => {
      const newScale = Math.min(8, Math.max(0.5, t.scale * factor))
      return { scale: newScale, tx: t.tx, ty: t.ty }
    })
  }, [])

  const resetView = useCallback(() => setTransform(INITIAL_TRANSFORM), [])

  const isZoomed = transform.scale !== 1 || transform.tx !== 0 || transform.ty !== 0

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs text-slate-400">
        <span>
          {visibleNodes.length} nodes · {clusters.length} cluster{clusters.length !== 1 ? 's' : ''}
          {nodes.length > MAX_NODES && ` (showing first ${MAX_NODES})`}
        </span>
        {isZoomed && (
          <button
            type="button"
            onClick={resetView}
            className="rounded-md border border-white/10 px-2 py-1 font-medium text-slate-200 hover:bg-white/5"
          >
            Reset view
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
          onClick={onClick}
          onWheel={onWheel}
          className="h-full w-full cursor-grab rounded-xl"
          style={{ width: '100%', height: DISPLAY_HEIGHT }}
          aria-label="Correlated slashing risk topology map"
        />

        {hover && (
          <div
            className="pointer-events-none absolute z-10 rounded-md border border-white/10 bg-slate-950/95 px-2.5 py-1.5 text-xs text-slate-100 shadow-lg"
            style={{
              left: Math.min(hover.px + 12, size.w - 160),
              top: Math.min(hover.py + 12, DISPLAY_HEIGHT - 60),
            }}
          >
            <div className="font-semibold">{hover.nodeId}</div>
            <div className="capitalize" style={{ color: TIER_COLOR[hover.tier] }}>
              {hover.clusterId >= 0 ? `Cluster ${hover.clusterId} · ${hover.tier}` : 'Noise (unclustered)'}
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-4 text-xs text-slate-400">
        <Legend color={TIER_COLOR.low} label="Low risk" />
        <Legend color={TIER_COLOR.medium} label="Medium risk" />
        <Legend color={TIER_COLOR.high} label="High risk" />
        <Legend color={TIER_COLOR.critical} label="Critical risk" />
        <Legend color={TIER_COLOR.noise} label="Unclustered" />
        <span className="ml-auto text-slate-500">Scroll to zoom · drag to pan · click node to inspect</span>
      </div>
    </div>
  )
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </span>
  )
}
