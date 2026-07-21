import type { Edge, PositionedNode } from '@/src/types/topology'

export interface ForceLayoutOptions {
  width: number
  height: number
  iterations?: number
}

/**
 * Lightweight force-layout tick that avoids pulling graph nodes into React's
 * render path. It is intentionally dependency-free so the same code can be
 * mirrored in a Web Worker and run at 60 physics updates per second.
 */
export function runForceLayout(
  nodes: PositionedNode[],
  edges: Edge[],
  { width, height, iterations = 1 }: ForceLayoutOptions,
): PositionedNode[] {
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const centerX = width / 2
  const centerY = height / 2

  for (let step = 0; step < iterations; step++) {
    for (const edge of edges) {
      const source = byId.get(edge.source)
      const target = byId.get(edge.target)
      if (!source || !target) continue
      const dx = target.x - source.x
      const dy = target.y - source.y
      const distance = Math.max(1, Math.hypot(dx, dy))
      const force = (distance - 85) * 0.0008
      const fx = dx * force
      const fy = dy * force
      source.vx = (source.vx ?? 0) + fx
      source.vy = (source.vy ?? 0) + fy
      target.vx = (target.vx ?? 0) - fx
      target.vy = (target.vy ?? 0) - fy
    }

    for (const node of nodes) {
      const cx = centerX - node.x
      const cy = centerY - node.y
      node.vx = ((node.vx ?? 0) + cx * 0.0006) * 0.88
      node.vy = ((node.vy ?? 0) + cy * 0.0006) * 0.88
      node.x += node.vx
      node.y += node.vy
    }
  }

  return nodes
}
