// Unit tests for Kafka consumer lag monitoring and auto-scaling.
// Issue #109 — comprehensive test suite.

import { describe, it, expect } from 'vitest';
import {
  derivePartitionStatus,
  deriveGroupStatus,
  computeTargetInstances,
  buildScalingEvent,
  generateDemoSnapshot,
  generateDemoScalingStatuses,
  createDemoKafkaMonitoringService,
} from '../services/kafkaMonitoringService';
import type { ConsumerGroupScalingConfig, PartitionLag } from '../types/kafka';

// ── derivePartitionStatus ────────────────────────────────────────────────────

describe('derivePartitionStatus', () => {
  it('returns healthy for lag below warning threshold', () => {
    expect(derivePartitionStatus(0)).toBe('healthy');
    expect(derivePartitionStatus(500)).toBe('healthy');
    expect(derivePartitionStatus(999)).toBe('healthy');
  });

  it('returns warning for lag between thresholds', () => {
    expect(derivePartitionStatus(1_000)).toBe('warning');
    expect(derivePartitionStatus(5_000)).toBe('warning');
    expect(derivePartitionStatus(9_999)).toBe('warning');
  });

  it('returns critical for lag at or above critical threshold', () => {
    expect(derivePartitionStatus(10_000)).toBe('critical');
    expect(derivePartitionStatus(100_000)).toBe('critical');
  });
});

// ── deriveGroupStatus ────────────────────────────────────────────────────────

describe('deriveGroupStatus', () => {
  function makePartition(lag: number): PartitionLag {
    return {
      partition: 0,
      logEndOffset: lag + 1000,
      consumerOffset: 1000,
      lag,
      status: derivePartitionStatus(lag),
    };
  }

  it('returns healthy when all partitions are healthy', () => {
    const partitions = [makePartition(0), makePartition(100), makePartition(500)];
    expect(deriveGroupStatus(partitions)).toBe('healthy');
  });

  it('returns warning when any partition is warning', () => {
    const partitions = [makePartition(0), makePartition(2_000), makePartition(100)];
    expect(deriveGroupStatus(partitions)).toBe('warning');
  });

  it('returns critical when any partition is critical', () => {
    const partitions = [makePartition(0), makePartition(2_000), makePartition(15_000)];
    expect(deriveGroupStatus(partitions)).toBe('critical');
  });

  it('critical takes precedence over warning', () => {
    const partitions = [makePartition(5_000), makePartition(20_000)];
    expect(deriveGroupStatus(partitions)).toBe('critical');
  });
});

// ── computeTargetInstances ───────────────────────────────────────────────────

describe('computeTargetInstances', () => {
  const base: ConsumerGroupScalingConfig = {
    groupId: 'test-group',
    scaleOutLagThreshold: 5_000,
    scaleInLagThreshold: 200,
    minInstances: 1,
    maxInstances: 8,
    currentInstances: 3,
  };

  it('returns null when lag is within stable range', () => {
    expect(computeTargetInstances(1_000, base)).toBeNull();
    expect(computeTargetInstances(200, base)).toBeNull();
  });

  it('scales out when lag exceeds scaleOutLagThreshold', () => {
    const result = computeTargetInstances(10_000, base);
    expect(result).not.toBeNull();
    expect(result!).toBeGreaterThan(base.currentInstances);
    expect(result!).toBeLessThanOrEqual(base.maxInstances);
  });

  it('scales in when lag drops below scaleInLagThreshold', () => {
    const result = computeTargetInstances(50, base);
    expect(result).not.toBeNull();
    expect(result!).toBeLessThan(base.currentInstances);
    expect(result!).toBeGreaterThanOrEqual(base.minInstances);
  });

  it('does not scale out beyond maxInstances', () => {
    const atMax = { ...base, currentInstances: 8 };
    expect(computeTargetInstances(100_000, atMax)).toBeNull();
  });

  it('does not scale in below minInstances', () => {
    const atMin = { ...base, currentInstances: 1 };
    expect(computeTargetInstances(0, atMin)).toBeNull();
  });

  it('scale-out factor grows with lag magnitude', () => {
    const result1 = computeTargetInstances(5_000, base);
    const result2 = computeTargetInstances(15_000, base);
    // higher lag should produce a higher or equal target
    expect((result2 ?? 0)).toBeGreaterThanOrEqual(result1 ?? 0);
  });
});

// ── buildScalingEvent ────────────────────────────────────────────────────────

describe('buildScalingEvent', () => {
  it('produces a valid ScalingEvent', () => {
    const event = buildScalingEvent('my-group', 2, 4, 8_000);
    expect(event.groupId).toBe('my-group');
    expect(event.previousInstances).toBe(2);
    expect(event.targetInstances).toBe(4);
    expect(event.lagAtTrigger).toBe(8_000);
    expect(event.reason).toBe('lag-high');
    expect(typeof event.id).toBe('string');
    expect(event.id.length).toBeGreaterThan(0);
    expect(typeof event.triggeredAt).toBe('number');
  });

  it('sets reason to lag-low when scaling in', () => {
    const event = buildScalingEvent('my-group', 4, 2, 100);
    expect(event.reason).toBe('lag-low');
  });

  it('sets reason to manual when specified', () => {
    const event = buildScalingEvent('my-group', 3, 3, 0, 'manual');
    expect(event.reason).toBe('manual');
  });

  it('generates unique IDs for distinct calls', () => {
    const e1 = buildScalingEvent('g', 1, 2, 0);
    const e2 = buildScalingEvent('g', 1, 2, 0);
    expect(e1.id).not.toBe(e2.id);
  });
});

// ── generateDemoSnapshot ─────────────────────────────────────────────────────

describe('generateDemoSnapshot', () => {
  it('returns an array of ConsumerGroupLag objects', () => {
    const snapshot = generateDemoSnapshot();
    expect(Array.isArray(snapshot)).toBe(true);
    expect(snapshot.length).toBeGreaterThan(0);
  });

  it('each group has required fields', () => {
    const snapshot = generateDemoSnapshot();
    for (const group of snapshot) {
      expect(typeof group.groupId).toBe('string');
      expect(typeof group.topic).toBe('string');
      expect(Array.isArray(group.partitions)).toBe(true);
      expect(group.partitions.length).toBeGreaterThan(0);
      expect(typeof group.totalLag).toBe('number');
      expect(typeof group.maxPartitionLag).toBe('number');
      expect(typeof group.capturedAt).toBe('number');
      expect(['healthy', 'warning', 'critical']).toContain(group.status);
    }
  });

  it('totalLag equals the sum of partition lags', () => {
    const snapshot = generateDemoSnapshot();
    for (const group of snapshot) {
      const sum = group.partitions.reduce((s, p) => s + p.lag, 0);
      expect(group.totalLag).toBe(sum);
    }
  });

  it('maxPartitionLag equals the max of individual partition lags', () => {
    const snapshot = generateDemoSnapshot();
    for (const group of snapshot) {
      const max = Math.max(...group.partitions.map((p) => p.lag));
      expect(group.maxPartitionLag).toBe(max);
    }
  });

  it('partition lag >= 0 for all partitions', () => {
    const snapshot = generateDemoSnapshot();
    for (const group of snapshot) {
      for (const p of group.partitions) {
        expect(p.lag).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

// ── generateDemoScalingStatuses ──────────────────────────────────────────────

describe('generateDemoScalingStatuses', () => {
  it('returns statuses for each demo group', () => {
    const statuses = generateDemoScalingStatuses();
    expect(statuses.length).toBeGreaterThan(0);
    for (const s of statuses) {
      expect(typeof s.groupId).toBe('string');
      expect(typeof s.enabled).toBe('boolean');
      expect(typeof s.config.minInstances).toBe('number');
      expect(typeof s.config.maxInstances).toBe('number');
      expect(s.config.minInstances).toBeGreaterThanOrEqual(1);
      expect(s.config.maxInstances).toBeGreaterThanOrEqual(s.config.minInstances);
    }
  });
});

// ── createDemoKafkaMonitoringService ─────────────────────────────────────────

describe('createDemoKafkaMonitoringService', () => {
  it('fetchConsumerLag resolves to a non-empty array', async () => {
    const svc = createDemoKafkaMonitoringService();
    const result = await svc.fetchConsumerLag();
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
  });

  it('fetchScalingStatuses resolves to a non-empty array', async () => {
    const svc = createDemoKafkaMonitoringService();
    const result = await svc.fetchScalingStatuses();
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
  });

  it('triggerManualScale updates the instance count', async () => {
    const svc = createDemoKafkaMonitoringService();
    const statuses = await svc.fetchScalingStatuses();
    const groupId = statuses[0].groupId;

    const event = await svc.triggerManualScale(groupId, 5);
    expect(event.groupId).toBe(groupId);
    expect(event.targetInstances).toBe(5);
    expect(event.reason).toBe('manual');

    // Config should reflect the new instance count
    const updated = await svc.fetchScalingStatuses();
    const updatedStatus = updated.find((s) => s.groupId === groupId);
    expect(updatedStatus?.config.currentInstances).toBe(5);
  });
});

// ── Kafka store ──────────────────────────────────────────────────────────────

describe('kafkaSlice store', () => {
  // Dynamic import to get a fresh module-level store reference
  it('upsertGroupLag and setGroups update the store correctly', async () => {
    const { useKafkaStore } = await import('../store/kafkaSlice');
    useKafkaStore.getState().reset();

    const group = generateDemoSnapshot()[0];
    useKafkaStore.getState().upsertGroupLag(group);

    const state = useKafkaStore.getState();
    expect(state.groups[group.groupId]).toBeDefined();
    expect(state.groups[group.groupId].groupId).toBe(group.groupId);
  });

  it('addScalingEvent prepends to history and respects max 200', async () => {
    const { useKafkaStore } = await import('../store/kafkaSlice');
    useKafkaStore.getState().reset();

    for (let i = 0; i < 205; i++) {
      useKafkaStore.getState().addScalingEvent(
        buildScalingEvent('g', 1, 2, 0),
      );
    }

    expect(useKafkaStore.getState().scalingHistory.length).toBe(200);
  });

  it('markRefreshed sets isLoaded and lastRefreshedAt', async () => {
    const { useKafkaStore } = await import('../store/kafkaSlice');
    useKafkaStore.getState().reset();

    const before = Date.now();
    useKafkaStore.getState().markRefreshed();
    const state = useKafkaStore.getState();

    expect(state.isLoaded).toBe(true);
    expect(state.lastRefreshedAt).toBeGreaterThanOrEqual(before);
    expect(state.error).toBeNull();
  });

  it('setError records error message', async () => {
    const { useKafkaStore } = await import('../store/kafkaSlice');
    useKafkaStore.getState().reset();

    useKafkaStore.getState().setError('something broke');
    expect(useKafkaStore.getState().error).toBe('something broke');
  });

  it('reset returns store to initial state', async () => {
    const { useKafkaStore } = await import('../store/kafkaSlice');
    useKafkaStore.getState().markRefreshed();
    useKafkaStore.getState().reset();

    const state = useKafkaStore.getState();
    expect(state.isLoaded).toBe(false);
    expect(state.groups).toEqual({});
    expect(state.scalingHistory).toEqual([]);
    expect(state.error).toBeNull();
  });
});

// ── Performance guard: computeTargetInstances P99 < 100ms ───────────────────

describe('performance', () => {
  it('computeTargetInstances completes 10 000 evaluations in < 100ms', () => {
    const config: ConsumerGroupScalingConfig = {
      groupId: 'perf-group',
      scaleOutLagThreshold: 5_000,
      scaleInLagThreshold: 200,
      minInstances: 1,
      maxInstances: 16,
      currentInstances: 4,
    };

    const start = performance.now();
    for (let i = 0; i < 10_000; i++) {
      computeTargetInstances(i * 10, config);
    }
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(100);
  });
});
