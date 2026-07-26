// Kafka consumer lag monitoring service.
// Issue #109 — system-wide implementation.
//
// In production this module would call a real Kafka metrics endpoint (e.g.
// Burrow, Confluent REST Proxy, or a bespoke scraper). In demo mode it returns
// deterministic synthetic data so the UI can be developed and tested without
// a live Kafka cluster.

import type {
  ConsumerGroupLag,
  DeadLetterMessage,
  DeadLetterQueueMetrics,
  DeadLetterReason,
  ConsumerGroupScalingConfig,
  PartitionLag,
  PartitionLagStatus,
  ScalingEvent,
  ScalingStatus,
} from '../types/kafka';

// ── Lag status thresholds ────────────────────────────────────────────────────

/** Per-partition lag that triggers a "warning" status. */
const WARNING_LAG_THRESHOLD = 1_000;
/** Per-partition lag that triggers a "critical" status. */
const CRITICAL_LAG_THRESHOLD = 10_000;

export function derivePartitionStatus(lag: number): PartitionLagStatus {
  if (lag >= CRITICAL_LAG_THRESHOLD) return 'critical';
  if (lag >= WARNING_LAG_THRESHOLD) return 'warning';
  return 'healthy';
}

export function deriveGroupStatus(partitions: PartitionLag[]): PartitionLagStatus {
  if (partitions.some((p) => p.status === 'critical')) return 'critical';
  if (partitions.some((p) => p.status === 'warning')) return 'warning';
  return 'healthy';
}


// ── Dead-letter queue logic ─────────────────────────────────────────────────

const MAX_PAYLOAD_PREVIEW_CHARS = 512;
const DLQ_CRITICAL_AGE_MS = 15 * 60 * 1000;
const DLQ_CRITICAL_DEPTH = 100;
const SECRET_FIELD_PATTERN = /(password|secret|token|privateKey|authorization)/i;

export interface FailedMessageInput {
  topic: string;
  partition: number;
  offset: number;
  consumerGroupId: string;
  attempts: number;
  error: unknown;
  payload: unknown;
  traceId?: string;
  failedAt?: number;
}

export function classifyDeadLetterReason(error: unknown, attempts: number): DeadLetterReason {
  const message = error instanceof Error ? error.message : String(error ?? '');
  if (/schema|validation|parse|invalid json/i.test(message)) return 'schema-invalid';
  if (/poison|non-retryable|fatal/i.test(message)) return 'poison-message';
  if (attempts >= 3) return 'retry-exhausted';
  if (message) return 'handler-error';
  return 'unknown';
}

function redactValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, nested]) => [
        key,
        SECRET_FIELD_PATTERN.test(key) ? '[REDACTED]' : redactValue(nested),
      ]),
    );
  }
  return value;
}

export function createPayloadPreview(payload: unknown): string {
  let serialized: string;
  try {
    serialized = typeof payload === 'string' ? payload : JSON.stringify(redactValue(payload));
  } catch {
    serialized = '[unserializable payload]';
  }
  return serialized.length > MAX_PAYLOAD_PREVIEW_CHARS
    ? `${serialized.slice(0, MAX_PAYLOAD_PREVIEW_CHARS)}…`
    : serialized;
}

export function buildDeadLetterMessage(input: FailedMessageInput): DeadLetterMessage {
  const failedAt = input.failedAt ?? Date.now();
  return {
    id: `${input.consumerGroupId}:${input.topic}:${input.partition}:${input.offset}`,
    topic: input.topic,
    partition: input.partition,
    offset: input.offset,
    consumerGroupId: input.consumerGroupId,
    attempts: input.attempts,
    reason: classifyDeadLetterReason(input.error, input.attempts),
    errorMessage: input.error instanceof Error ? input.error.message : String(input.error ?? 'Unknown error'),
    payloadPreview: createPayloadPreview(input.payload),
    firstFailedAt: failedAt,
    lastFailedAt: failedAt,
    status: 'quarantined',
    traceId: input.traceId,
  };
}

export function summarizeDeadLetters(
  messages: DeadLetterMessage[],
  now: number = Date.now(),
): DeadLetterQueueMetrics {
  const oldest = messages.reduce((age, message) => Math.max(age, now - message.firstFailedAt), 0);
  const metrics = messages.reduce<DeadLetterQueueMetrics>((acc, message) => {
    acc.total += 1;
    if (message.status === 'quarantined') acc.quarantined += 1;
    if (message.status === 'replay-ready') acc.replayReady += 1;
    if (message.status === 'replayed') acc.replayed += 1;
    if (message.status === 'discarded') acc.discarded += 1;
    return acc;
  }, { total: 0, quarantined: 0, replayReady: 0, replayed: 0, discarded: 0, oldestMessageAgeMs: oldest, critical: false });
  metrics.critical = metrics.quarantined >= DLQ_CRITICAL_DEPTH || oldest >= DLQ_CRITICAL_AGE_MS;
  return metrics;
}

// ── Auto-scaling logic ────────────────────────────────────────────────────────

/**
 * Given current lag and a scaling config, compute the target instance count.
 * Returns `null` when no change is required.
 *
 * Performance target: pure sync function, always < 100 µs.
 */
export function computeTargetInstances(
  totalLag: number,
  config: ConsumerGroupScalingConfig,
): number | null {
  const { currentInstances, minInstances, maxInstances } = config;

  if (totalLag >= config.scaleOutLagThreshold && currentInstances < maxInstances) {
    // Scale out: add one instance per 10× lag above threshold, capped at max.
    const factor = Math.ceil(totalLag / config.scaleOutLagThreshold);
    return Math.min(currentInstances + factor, maxInstances);
  }

  if (totalLag < config.scaleInLagThreshold && currentInstances > minInstances) {
    // Scale in: remove one instance.
    return Math.max(currentInstances - 1, minInstances);
  }

  return null; // no change
}

/**
 * Build a ScalingEvent from a scaling decision.
 */
export function buildScalingEvent(
  groupId: string,
  previousInstances: number,
  targetInstances: number,
  lagAtTrigger: number,
  reason: ScalingEvent['reason'] = 'lag-high',
): ScalingEvent {
  let derivedReason: ScalingEvent['reason'];
  if (reason === 'manual') {
    derivedReason = 'manual';
  } else {
    derivedReason = targetInstances > previousInstances ? 'lag-high' : 'lag-low';
  }

  return {
    id: `${groupId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    groupId,
    triggeredAt: Date.now(),
    previousInstances,
    targetInstances,
    reason: derivedReason,
    lagAtTrigger,
  };
}

// ── Demo data generation ──────────────────────────────────────────────────────

/** Lightweight LCG for reproducible-ish demo data that evolves each call. */
let _seed = 0xdeadbeef;
function lcg(): number {
  _seed = Math.imul(_seed ^ (_seed >>> 13), 0x9e3779b9);
  _seed = _seed ^ (_seed >>> 11);
  return (_seed >>> 0) / 0x1_0000_0000;
}

const DEMO_TOPICS = [
  'validator-attestations',
  'block-proposals',
  'sync-committee-duties',
  'reward-calculations',
  'node-health-events',
];

const DEMO_GROUPS = [
  'attestation-processor',
  'block-builder',
  'sync-committee-monitor',
  'reward-indexer',
  'health-aggregator',
];

const DEMO_SCALING_CONFIGS: ConsumerGroupScalingConfig[] = DEMO_GROUPS.map((groupId, i) => ({
  groupId,
  scaleOutLagThreshold: 5_000,
  scaleInLagThreshold: 200,
  minInstances: 1,
  maxInstances: 8,
  currentInstances: 2 + (i % 3),
}));

/** Generate a deterministic-ish snapshot for all demo consumer groups. */
export function generateDemoSnapshot(): ConsumerGroupLag[] {
  return DEMO_GROUPS.map((groupId, gi) => {
    const topic = DEMO_TOPICS[gi % DEMO_TOPICS.length];
    const partitionCount = 4 + (gi % 4); // 4–7 partitions per group
    const partitions: PartitionLag[] = Array.from({ length: partitionCount }, (_, pi) => {
      const logEndOffset = 100_000 + Math.floor(lcg() * 50_000);
      // Occasionally spike one partition for demo variety
      const lagBase = gi === 2 && pi === 1 ? 12_000 : gi === 0 ? 800 : 200;
      const lag = Math.max(0, Math.floor(lagBase + lcg() * lagBase));
      const consumerOffset = logEndOffset - lag;
      const status = derivePartitionStatus(lag);
      return { partition: pi, logEndOffset, consumerOffset, lag, status };
    });

    const totalLag = partitions.reduce((s, p) => s + p.lag, 0);
    const maxPartitionLag = Math.max(...partitions.map((p) => p.lag));

    return {
      groupId,
      topic,
      partitions,
      totalLag,
      maxPartitionLag,
      capturedAt: Date.now(),
      status: deriveGroupStatus(partitions),
    };
  });
}

/** Generate initial scaling status for all demo groups. */
export function generateDemoScalingStatuses(): ScalingStatus[] {
  return DEMO_SCALING_CONFIGS.map((config) => ({
    groupId: config.groupId,
    enabled: true,
    config,
    lastEvent: null,
  }));
}

// ── HTTP service ──────────────────────────────────────────────────────────────

export interface KafkaMonitoringProvider {
  /**
   * Fetch the current consumer lag snapshot for all tracked groups.
   * Returns an empty array on any error.
   */
  fetchConsumerLag(): Promise<ConsumerGroupLag[]>;

  /**
   * Fetch current scaling status for all groups.
   */
  fetchScalingStatuses(): Promise<ScalingStatus[]>;

  /**
   * Trigger a manual scaling action for a group.
   * Returns the resulting ScalingEvent.
   */
  triggerManualScale(groupId: string, targetInstances: number): Promise<ScalingEvent>;

  /** Fetch messages currently retained in the dead-letter queue. */
  fetchDeadLetters(): Promise<DeadLetterMessage[]>;

  /** Mark a dead-lettered message as replay-ready or replayed after operator review. */
  updateDeadLetterStatus(id: string, status: DeadLetterMessage['status']): Promise<DeadLetterMessage>;
}

/** Demo provider — deterministic, zero network calls. */
export function createDemoKafkaMonitoringService(): KafkaMonitoringProvider {
  const scalingStatuses = generateDemoScalingStatuses();
  const deadLetters: DeadLetterMessage[] = [
    buildDeadLetterMessage({
      topic: 'validator-attestations',
      partition: 2,
      offset: 88421,
      consumerGroupId: 'attestation-processor',
      attempts: 3,
      error: new Error('schema validation failed: missing validatorIndex'),
      payload: { attestationId: 'att_88421', token: 'demo-secret', slot: 982121 },
      traceId: '4bf92f3577b34da6a3ce929d0e0e4736',
      failedAt: Date.now() - 5 * 60 * 1000,
    }),
  ];

  return {
    async fetchConsumerLag() {
      return generateDemoSnapshot();
    },

    async fetchScalingStatuses() {
      return scalingStatuses;
    },

    async fetchDeadLetters() {
      return deadLetters;
    },

    async updateDeadLetterStatus(id, status) {
      const message = deadLetters.find((m) => m.id === id);
      if (!message) throw new Error(`Dead-letter message not found: ${id}`);
      message.status = status;
      message.lastFailedAt = Date.now();
      return message;
    },

    async triggerManualScale(groupId, targetInstances) {
      const status = scalingStatuses.find((s) => s.groupId === groupId);
      const previous = status?.config.currentInstances ?? 1;
      const event = buildScalingEvent(groupId, previous, targetInstances, 0, 'manual');
      if (status) {
        status.config.currentInstances = targetInstances;
        status.lastEvent = event;
      }
      return event;
    },
  };
}

/** Production provider — calls real Kafka metrics endpoints. */
export function createKafkaMonitoringService(baseUrl: string): KafkaMonitoringProvider {
  return {
    async fetchConsumerLag() {
      try {
        const res = await fetch(`${baseUrl}/api/kafka/consumer-lag`);
        if (!res.ok) return [];
        return (await res.json()) as ConsumerGroupLag[];
      } catch {
        return [];
      }
    },

    async fetchScalingStatuses() {
      try {
        const res = await fetch(`${baseUrl}/api/kafka/scaling-status`);
        if (!res.ok) return [];
        return (await res.json()) as ScalingStatus[];
      } catch {
        return [];
      }
    },


    async fetchDeadLetters() {
      try {
        const res = await fetch(`${baseUrl}/api/kafka/dead-letters`);
        if (!res.ok) return [];
        return (await res.json()) as DeadLetterMessage[];
      } catch {
        return [];
      }
    },

    async updateDeadLetterStatus(id, status) {
      const res = await fetch(`${baseUrl}/api/kafka/dead-letters/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error(`DLQ update failed: ${res.status}`);
      return (await res.json()) as DeadLetterMessage;
    },

    async triggerManualScale(groupId, targetInstances) {
      const res = await fetch(`${baseUrl}/api/kafka/scale`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupId, targetInstances }),
      });
      if (!res.ok) {
        throw new Error(`Scale request failed: ${res.status}`);
      }
      return (await res.json()) as ScalingEvent;
    },
  };
}
