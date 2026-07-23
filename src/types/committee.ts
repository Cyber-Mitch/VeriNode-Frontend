// Sharded committee assignment types.
//
// Under committee-based / Danksharding assignment, each epoch partitions
// validators into 64 shard committees; a validator serves exactly one shard
// per epoch. These types model an operator's per-epoch assignments, the layout
// produced for the topology map, and the concentration-risk summary.

export const SHARD_COUNT = 64
export const MAX_VALIDATORS = 1024
export const RETENTION_EPOCHS = 256
export const CONCENTRATION_THRESHOLD = 0.2

/** One validator's shard assignment in a given epoch. */
export interface CommitteeAssignment {
  validatorIndex: number
  epoch: number
  /** Shard committee index, 0..63. */
  shard: number
}

/** All of an operator's validator assignments for a single epoch. */
export interface EpochAssignments {
  epoch: number
  /** Unix-ms timestamp of the epoch boundary. */
  timestamp: number
  assignments: CommitteeAssignment[]
}

/** A laid-out node position for canvas rendering. */
export interface NodePosition {
  validatorIndex: number
  shard: number
  x: number
  y: number
}

export interface ShardCentroid {
  shard: number
  x: number
  y: number
  count: number
}

/** Layout result returned by the committee layout worker. */
export interface CommitteeLayout {
  epoch: number
  width: number
  height: number
  nodes: NodePosition[]
  centroids: ShardCentroid[]
}

/** Per-shard concentration share for an operator. */
export interface ShardShare {
  shard: number
  count: number
  /** Fraction of the operator's validators on this shard (0..1). */
  share: number
}

/** Concentration-risk summary for one epoch. */
export interface ConcentrationResult {
  total: number
  perShard: ShardShare[]
  maxShare: number
  topShard: number | null
  /** True when any shard holds more than the concentration threshold. */
  atRisk: boolean
}

// ---- worker message protocol --------------------------------------------

export type CommitteeLayoutRequest = {
  type: 'LAYOUT'
  payload: {
    requestId: string
    epoch: number
    width: number
    height: number
    assignments: Array<{ validatorIndex: number; shard: number }>
  }
}

export type CommitteeLayoutResponse =
  | { type: 'LAYOUT'; payload: { requestId: string; layout: CommitteeLayout } }
  | { type: 'ERROR'; payload: { requestId: string; message: string } }
