import { useMemo } from 'react'
import type { Edge, Node } from '@/src/types/topology'

const NODE_COUNT = 10000
const EDGE_COUNT = 14000
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5))

/** Deterministic high-density topology data used by the canvas network map. */
export function useNodeTopology(nodeCount = NODE_COUNT) {
  return useMemo(() => {
    const nodes: Node[] = Array.from({ length: nodeCount }, (_, i) => {
      const radius = 30 + Math.sqrt(i) * 7
      const theta = i * GOLDEN_ANGLE
      return {
        id: `validator-${i}`,
        label: `Validator ${i}`,
        status: i % 41 === 0 ? 'offline' : i % 17 === 0 ? 'syncing' : 'active',
        x: Math.cos(theta) * radius,
        y: Math.sin(theta) * radius,
        latencyMs: 20 + ((i * 37) % 220),
        stake: 32 + (i % 96),
      }
    })

    const edges: Edge[] = Array.from({ length: Math.min(EDGE_COUNT, nodeCount * 2) }, (_, i) => {
      const source = i % nodeCount
      const target = (source + 1 + ((i * 97) % Math.max(1, nodeCount - 1))) % nodeCount
      return {
        id: `edge-${i}`,
        source: `validator-${source}`,
        target: `validator-${target}`,
        latencyMs: 15 + ((source + target) % 260),
      }
    })

    return { nodes, edges }
  }, [nodeCount])
}
