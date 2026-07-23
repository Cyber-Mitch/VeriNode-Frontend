// Connection Pool Health Probe types (#105).
//
// Models the state and configuration of a connection pool whose size adapts to
// observed utilisation.  All latency values are in milliseconds.

/** Health classification derived from a composite probe score. */
export type PoolHealthColor = 'green' | 'yellow' | 'red'

/** Health status codes for individual pool connections. */
export type ConnectionStatus = 'idle' | 'active' | 'error'

/** A single probe sample collected from a connection pool. */
export interface PoolProbeSample {
  /** Unix-millisecond timestamp when the probe was taken. */
  timestamp: number
  /** Total connections in the pool (active + idle). */
  totalConnections: number
  /** Connections currently serving a request. */
  activeConnections: number
  /** Connections waiting for a connection to become available. */
  waitingRequests: number
  /** P99 latency (ms) for the probe ping over the last sample window. */
  p99LatencyMs: number
  /** Whether the probe itself succeeded. */
  healthy: boolean
}

/** Configuration passed to `createConnectionPoolProbe`. */
export interface PoolProbeConfig {
  /**
   * Minimum pool size to maintain, even under low utilisation.
   * @default 2
   */
  minPoolSize?: number
  /**
   * Maximum pool size the adaptive algorithm may grow to.
   * @default 20
   */
  maxPoolSize?: number
  /**
   * Target utilisation ratio (0–1) at which the pool is considered well-sized.
   * Above this threshold the pool grows; below `targetUtilisation * 0.5` it shrinks.
   * @default 0.7
   */
  targetUtilisation?: number
  /**
   * P99 latency (ms) that must not be exceeded for the pool to be "green".
   * @default 100
   */
  p99ThresholdMs?: number
  /**
   * Number of waiting requests above which the pool is considered overloaded.
   * @default 5
   */
  waitQueueThreshold?: number
  /**
   * Size-step used when growing or shrinking the pool.
   * @default 2
   */
  resizeStep?: number
}

/** Live snapshot of pool state returned by a probe. */
export interface PoolHealthSnapshot {
  timestamp: number
  /** Recommended pool size after adaptive sizing computation. */
  recommendedPoolSize: number
  /** Pool utilisation ratio (activeConnections / totalConnections). */
  utilisation: number
  /** Composite health score 0–100. */
  score: number
  /** Traffic-light summary. */
  color: PoolHealthColor
  /** Latest probe sample. */
  probe: PoolProbeSample
  /** True when the adaptive algorithm increased the pool size. */
  scaled: boolean
  /** Human-readable explanation of the scaling decision, or null if unchanged. */
  scalingReason: string | null
}

/** Aggregated metrics over a history window. */
export interface PoolHealthMetrics {
  /** P99 latency over all samples in the window (ms). */
  p99LatencyMs: number
  /** Average utilisation over the window. */
  avgUtilisation: number
  /** Peak active connections observed in the window. */
  peakActiveConnections: number
  /** Number of samples in the window. */
  sampleCount: number
  /** Percentage of healthy samples. */
  availabilityPct: number
}
