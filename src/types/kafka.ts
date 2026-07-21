// Kafka consumer lag monitoring and auto-scaling types.
// Issue #109 — system-wide implementation.

/** Health status of a single consumer group partition. */
export type PartitionLagStatus = 'healthy' | 'warning' | 'critical';

/** A single partition's lag snapshot. */
export interface PartitionLag {
  /** Kafka partition number (0-indexed). */
  partition: number;
  /** Log-end offset — latest offset produced to this partition. */
  logEndOffset: number;
  /** Current offset committed by the consumer group. */
  consumerOffset: number;
  /** Lag = logEndOffset − consumerOffset. */
  lag: number;
  /** Derived status based on lag thresholds. */
  status: PartitionLagStatus;
}

/** Aggregated lag snapshot for one consumer group across all partitions. */
export interface ConsumerGroupLag {
  /** Unique consumer group ID. */
  groupId: string;
  /** Kafka topic being consumed. */
  topic: string;
  /** Per-partition breakdowns. */
  partitions: PartitionLag[];
  /** Sum of lag across all partitions. */
  totalLag: number;
  /** Max single-partition lag. */
  maxPartitionLag: number;
  /** Timestamp (ms) when this snapshot was taken. */
  capturedAt: number;
  /** Derived group-level health. */
  status: PartitionLagStatus;
}

/** Auto-scaling decision record for a consumer group. */
export interface ScalingEvent {
  /** Unique event ID. */
  id: string;
  /** Consumer group this event applies to. */
  groupId: string;
  /** UTC timestamp (ms) of the scaling action. */
  triggeredAt: number;
  /** Consumer instance count before the action. */
  previousInstances: number;
  /** Consumer instance count after the action. */
  targetInstances: number;
  /** Reason code for the decision. */
  reason: 'lag-high' | 'lag-low' | 'manual';
  /** Total lag that triggered the event. */
  lagAtTrigger: number;
}

/** Configuration thresholds for auto-scaling a consumer group. */
export interface ConsumerGroupScalingConfig {
  groupId: string;
  /** Lag above this value triggers a scale-out. */
  scaleOutLagThreshold: number;
  /** Lag below this value triggers a scale-in. */
  scaleInLagThreshold: number;
  /** Minimum number of consumer instances. */
  minInstances: number;
  /** Maximum number of consumer instances. */
  maxInstances: number;
  /** Current running instance count. */
  currentInstances: number;
}

/** Current auto-scaling status for a consumer group. */
export interface ScalingStatus {
  groupId: string;
  /** Whether auto-scaling is enabled for this group. */
  enabled: boolean;
  config: ConsumerGroupScalingConfig;
  /** Most recent scaling event, if any. */
  lastEvent: ScalingEvent | null;
}

/** Zustand store state shape for the Kafka monitoring slice. */
export interface KafkaMonitoringState {
  /** All tracked consumer group lag snapshots, keyed by groupId. */
  groups: Record<string, ConsumerGroupLag>;
  /** Scaling status keyed by groupId. */
  scalingStatus: Record<string, ScalingStatus>;
  /** History of scaling events (most-recent first). */
  scalingHistory: ScalingEvent[];
  /** Whether initial data has been loaded. */
  isLoaded: boolean;
  /** Last poll error message, if any. */
  error: string | null;
  /** Timestamp (ms) of the last successful refresh. */
  lastRefreshedAt: number | null;
}
