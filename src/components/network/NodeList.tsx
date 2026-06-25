import { NodeCard } from '@/src/components/network/NodeCard'
import type { NetworkNode } from '@/src/types/node'

/** Renders a responsive grid of node cards. */
export function NodeList({ nodes }: { nodes: NetworkNode[] }) {
  if (nodes.length === 0) {
    return <p className="text-sm text-slate-400">No nodes to display.</p>
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2" data-testid="node-list">
      {nodes.map((node) => (
        <NodeCard key={node.id} node={node} />
      ))}
    </div>
  )
}
