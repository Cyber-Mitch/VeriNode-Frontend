// Node synchronization progress types for issue #101.
//
// All block heights are plain numbers (not bigint) because block indices fit
// safely within JS Number.MAX_SAFE_INTEGER for any foreseeable chain height.

/** Whether the node is currently syncing, fully synced, or stalled. */
export type SyncPhase = 'syncing' | 'synced' | 'stalled'

/** Reason a stall was detected (mutually exclusive). */
export type StallReason = 'no_peers' | 'slow_peer' | 'processing_lag'

/** Single data point for the sync-speed history line chart. */
export interface SyncSpeedPoint {
  /** Unix-ms timestamp. */
  timestamp: number
  /** Blocks downloaded per second at this moment. */
  blocksPerSecond: number
}

/** Single data point for the peer-count history line chart. */
export interface PeerCountPoint {
  /** Unix-ms timestamp. */
  timestamp: number
  /** Number of connected peers. */
  peerCount: number
}

/**
 * Snapshot of a node's synchronization state.
 * Returned by GET /api/v1/node/sync-status and pushed over WebSocket.
 */
export interface SyncStatus {
  /** Local node's current block height. */
  currentHeight: number
  /** The chain tip as observed from the best peer. */
  networkTipHeight: number
  /** Block height of the most-advanced peer (≥ networkTipHeight). */
  bestPeerHeight: number
  /** Download throughput in blocks per second (trailing average). */
  downloadSpeedBps: number
  /** Estimated seconds until fully synced; null when synced or stalled. */
  estimatedSecondsRemaining: number | null
  /** Number of currently connected peers. */
  peerCount: number
  /** Distribution of peer block heights, bucketed for the histogram. */
  peerHeights: number[]
  /** Current sync phase. */
  phase: SyncPhase
  /** Populated only when phase === 'stalled'. */
  stallReason?: StallReason
  /** Human-readable diagnostic message for a stall. */
  stallMessage?: string
  /** Unix-ms of the last time block height advanced. */
  lastProgressAt: number
  /** History of download speed over time (most recent last). */
  speedHistory: SyncSpeedPoint[]
  /** History of peer count over time (most recent last). */
  peerCountHistory: PeerCountPoint[]
}

/**
 * Bucket in the peer-height histogram.
 * The histogram groups peer heights into fixed-width ranges.
 */
export interface PeerHeightBucket {
  /** Human-readable label, e.g. "1,950,000 – 1,960,000". */
  label: string
  /** Lower bound (inclusive). */
  from: number
  /** Upper bound (exclusive). */
  to: number
  /** Number of peers whose latest block falls in this range. */
  count: number
  /** True when the local node's current height falls in this bucket. */
  isLocalNode: boolean
}
