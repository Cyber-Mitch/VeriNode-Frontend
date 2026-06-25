/**
 * Reputation system types for tracking node reputation scores over time.
 */

export interface ReputationDataPoint {
  /** Unix timestamp in milliseconds */
  timestamp: number;
  /** Reputation score value */
  score: number;
  /** Optional event type that caused the change */
  eventType?: 'reward' | 'slashing' | 'recovery';
}

export interface ReputationEvent {
  /** Unique node identifier */
  nodeId: string;
  /** Reputation change data */
  data: ReputationDataPoint;
}

export interface BatchedReputationData {
  /** Array of buffered data points */
  points: ReputationDataPoint[];
  /** Total number of points in the batch */
  count: number;
  /** Timestamp of first point in batch */
  firstTimestamp: number;
  /** Timestamp of last point in batch */
  lastTimestamp: number;
}

export interface DecimationConfig {
  /** Enable decimation when event rate exceeds this threshold (events/sec) */
  threshold: number;
  /** Granularity for aggregation in milliseconds (default: 1000ms) */
  granularityMs: number;
  /** Whether decimation is currently active */
  active: boolean;
}

export interface ChartPerformanceMetrics {
  /** Number of chart updates performed */
  updateCount: number;
  /** Total time spent in chart updates (ms) */
  totalUpdateTime: number;
  /** Maximum single frame freeze duration (ms) */
  maxFrameFreeze: number;
  /** Number of dropped frames */
  droppedFrames: number;
  /** Average update time per call (ms) */
  averageUpdateTime: number;
}
