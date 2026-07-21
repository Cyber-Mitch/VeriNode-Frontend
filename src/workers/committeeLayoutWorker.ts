// Web worker for committee topology layout.
//
// Computes node positions off the main thread so rendering up to 1,024
// validators stays smooth. Shards are laid out on an 8×8 grid of centroids;
// each shard's validators are packed around their centroid via a golden-angle
// (phyllotaxis) spiral, which gives an even, force-directed-like clustering
// without an iterative simulation.

import {
  SHARD_COUNT,
  type CommitteeLayout,
  type CommitteeLayoutRequest,
  type CommitteeLayoutResponse,
  type NodePosition,
  type ShardCentroid,
} from '@/src/types/committee'

const GRID_COLS = 8
const GRID_ROWS = 8 // 8 × 8 = 64 shards
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5)) // ≈2.39996 rad

function post(message: CommitteeLayoutResponse): void {
  ;(self as unknown as Worker).postMessage(message)
}

function computeLayout(
  epoch: number,
  width: number,
  height: number,
  assignments: Array<{ validatorIndex: number; shard: number }>,
): CommitteeLayout {
  const cellW = width / GRID_COLS
  const cellH = height / GRID_ROWS

  const counts = new Array<number>(SHARD_COUNT).fill(0)
  for (const a of assignments) {
    if (a.shard >= 0 && a.shard < SHARD_COUNT) counts[a.shard]++
  }

  const centroids: ShardCentroid[] = new Array(SHARD_COUNT)
  for (let s = 0; s < SHARD_COUNT; s++) {
    const col = s % GRID_COLS
    const row = Math.floor(s / GRID_COLS)
    centroids[s] = {
      shard: s,
      x: col * cellW + cellW / 2,
      y: row * cellH + cellH / 2,
      count: counts[s],
    }
  }

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

self.onmessage = (e: MessageEvent<CommitteeLayoutRequest>) => {
  const msg = e.data
  if (msg.type !== 'LAYOUT') return
  const { requestId, epoch, width, height, assignments } = msg.payload
  try {
    post({ type: 'LAYOUT', payload: { requestId, layout: computeLayout(epoch, width, height, assignments) } })
  } catch (err) {
    post({
      type: 'ERROR',
      payload: { requestId, message: err instanceof Error ? err.message : 'Unknown worker error' },
    })
  }
}
