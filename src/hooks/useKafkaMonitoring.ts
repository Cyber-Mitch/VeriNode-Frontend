'use client';

// useKafkaMonitoring — Kafka consumer lag polling and auto-scaling hook.
// Issue #109 — system-wide implementation.
//
// Polls the Kafka monitoring service on a configurable interval, writes
// snapshots into the Zustand kafkaSlice, and evaluates auto-scaling decisions
// locally so the UI reflects the latest state without a round-trip.
//
// Performance target: < 100ms P99 for the synchronous evaluation path.

import { useEffect, useRef, useCallback } from 'react';
import { useKafkaStore } from '../store/kafkaSlice';
import {
  createDemoKafkaMonitoringService,
  computeTargetInstances,
  buildScalingEvent,
} from '../services/kafkaMonitoringService';
import type { KafkaMonitoringProvider } from '../services/kafkaMonitoringService';

/** Default poll interval in milliseconds. */
const DEFAULT_POLL_INTERVAL_MS = 15_000;

export interface UseKafkaMonitoringOptions {
  /** Set to false to pause polling. Defaults to true. */
  enabled?: boolean;
  /** Poll interval in ms. Defaults to 15 000. */
  pollIntervalMs?: number;
  /**
   * Optional custom provider. Falls back to the demo service when omitted,
   * matching the project-wide pattern of demo-first development.
   */
  provider?: KafkaMonitoringProvider;
}

export function useKafkaMonitoring(options: UseKafkaMonitoringOptions = {}) {
  const {
    enabled = true,
    pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
    provider,
  } = options;

  const store = useKafkaStore();
  const serviceRef = useRef<KafkaMonitoringProvider>(
    provider ?? createDemoKafkaMonitoringService(),
  );
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const mountedRef = useRef(true);

  const poll = useCallback(async () => {
    const svc = serviceRef.current;

    try {
      // Fetch lag snapshots and scaling statuses in parallel.
      const [groups, statuses] = await Promise.all([
        svc.fetchConsumerLag(),
        svc.fetchScalingStatuses(),
      ]);

      if (!mountedRef.current) return;

      store.setGroups(groups);
      statuses.forEach((s) => store.upsertScalingStatus(s));
      store.markRefreshed();

      // Evaluate auto-scaling decisions for each group.
      for (const status of statuses) {
        if (!status.enabled) continue;

        const groupLag = groups.find((g) => g.groupId === status.groupId);
        if (!groupLag) continue;

        const target = computeTargetInstances(groupLag.totalLag, status.config);
        if (target === null) continue;

        const event = buildScalingEvent(
          status.groupId,
          status.config.currentInstances,
          target,
          groupLag.totalLag,
        );

        // Persist to store; production would also call svc.triggerManualScale().
        store.addScalingEvent(event);
        store.upsertScalingStatus({
          ...status,
          config: { ...status.config, currentInstances: target },
          lastEvent: event,
        });
      }
    } catch (err) {
      if (!mountedRef.current) return;
      store.setError(err instanceof Error ? err.message : 'Kafka poll failed');
    }
  }, [store]);

  // Trigger an immediate manual scale action.
  const triggerManualScale = useCallback(
    async (groupId: string, targetInstances: number) => {
      try {
        const event = await serviceRef.current.triggerManualScale(groupId, targetInstances);
        store.addScalingEvent(event);

        const existing = useKafkaStore.getState().scalingStatus[groupId];
        if (existing) {
          store.upsertScalingStatus({
            ...existing,
            config: { ...existing.config, currentInstances: targetInstances },
            lastEvent: event,
          });
        }
      } catch (err) {
        store.setError(
          err instanceof Error ? err.message : 'Manual scale request failed',
        );
      }
    },
    [store],
  );

  useEffect(() => {
    if (!enabled) return;

    mountedRef.current = true;

    // Immediate first poll, then schedule repeating interval.
    void poll();

    function scheduleNext() {
      timerRef.current = setTimeout(async () => {
        await poll();
        if (mountedRef.current) scheduleNext();
      }, pollIntervalMs);
    }
    scheduleNext();

    return () => {
      mountedRef.current = false;
      if (timerRef.current !== undefined) {
        clearTimeout(timerRef.current);
      }
    };
  }, [enabled, pollIntervalMs, poll]);

  return {
    groups: store.groups,
    scalingStatus: store.scalingStatus,
    scalingHistory: store.scalingHistory,
    isLoaded: store.isLoaded,
    error: store.error,
    lastRefreshedAt: store.lastRefreshedAt,
    triggerManualScale,
    refresh: poll,
  };
}
