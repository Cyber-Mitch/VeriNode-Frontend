export type NodeStatus = 'active' | 'syncing' | 'offline'

export interface Node {
  id: string
  label: string
  status: NodeStatus
  x?: number
  y?: number
  latencyMs?: number
  stake?: number
}

export interface Edge {
  id: string
  source: string
  target: string
  latencyMs: number
}

export interface PositionedNode extends Node {
  x: number
  y: number
  vx?: number
  vy?: number
}

export interface PositionedEdge extends Edge {
  sourceX: number
  sourceY: number
  targetX: number
  targetY: number
}

export interface TopologySnapshot {
  nodes: PositionedNode[]
  edges: Edge[]
}
