'use client'

import { NodeTopologyMap } from '@/src/components/network/NodeTopologyMap'
import { useNodeTopology } from '@/src/hooks/useNodeTopology'

/** Compatibility wrapper that routes the legacy graph surface to canvas rendering. */
export function NetworkGraph() {
  const topology = useNodeTopology()
  return <NodeTopologyMap nodes={topology.nodes.map((node) => ({ ...node, x: node.x ?? 0, y: node.y ?? 0 }))} edges={topology.edges} />
}
