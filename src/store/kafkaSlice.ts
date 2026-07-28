// Kafka consumer lag monitoring and auto-scaling store.
// Issue #109 — system-wide implementation.

import { create } from 'zustand';
import type {
  ConsumerGroupLag,
  KafkaMonitoringState,
  DeadLetterMessage,
  DeadLetterQueueMetrics,
  ScalingEvent,
  ScalingStatus,
} from '../types/kafka';

interface KafkaMonitoringActions {
  /** Replace (or insert) a group lag snapshot. */
  upsertGroupLag: (lag: ConsumerGroupLag) => void;
  /** Replace all group lag snapshots at once. */
  setGroups: (groups: ConsumerGroupLag[]) => void;
  /** Update scaling status for a group. */
  upsertScalingStatus: (status: ScalingStatus) => void;
  /** Replace dead-letter queue messages. */
  setDeadLetters: (messages: DeadLetterMessage[]) => void;
  /** Upsert a single dead-letter queue message. */
  upsertDeadLetter: (message: DeadLetterMessage) => void;
  /** Recompute dead-letter metrics from the current queue. */
  setDeadLetterMetrics: (metrics: DeadLetterQueueMetrics) => void;
  /** Prepend a new scaling event to the history ring-buffer (max 200). */
  addScalingEvent: (event: ScalingEvent) => void;
  /** Mark store as loaded and record the refresh timestamp. */
  markRefreshed: () => void;
  /** Set the current error message. Pass null to clear. */
  setError: (error: string | null) => void;
  /** Reset the store to initial state. */
  reset: () => void;
}

const MAX_SCALING_HISTORY = 200;

const emptyDeadLetterMetrics: DeadLetterQueueMetrics = {
  total: 0,
  quarantined: 0,
  replayReady: 0,
  replayed: 0,
  discarded: 0,
  oldestMessageAgeMs: 0,
  critical: false,
};

const initialState: KafkaMonitoringState = {
  groups: {},
  scalingStatus: {},
  scalingHistory: [],
  deadLetters: {},
  deadLetterMetrics: emptyDeadLetterMetrics,
  isLoaded: false,
  error: null,
  lastRefreshedAt: null,
};

export const useKafkaStore = create<KafkaMonitoringState & KafkaMonitoringActions>(
  (set) => ({
    ...initialState,

    upsertGroupLag: (lag) =>
      set((s) => ({
        groups: { ...s.groups, [lag.groupId]: lag },
      })),

    setGroups: (groups) =>
      set(() => ({
        groups: Object.fromEntries(groups.map((g) => [g.groupId, g])),
      })),

    upsertScalingStatus: (status) =>
      set((s) => ({
        scalingStatus: { ...s.scalingStatus, [status.groupId]: status },
      })),

    setDeadLetters: (messages) =>
      set(() => ({
        deadLetters: Object.fromEntries(messages.map((m) => [m.id, m])),
      })),

    upsertDeadLetter: (message) =>
      set((s) => ({
        deadLetters: { ...s.deadLetters, [message.id]: message },
      })),

    setDeadLetterMetrics: (metrics) => set({ deadLetterMetrics: metrics }),

    addScalingEvent: (event) =>
      set((s) => ({
        scalingHistory: [event, ...s.scalingHistory].slice(0, MAX_SCALING_HISTORY),
      })),

    markRefreshed: () =>
      set({ isLoaded: true, lastRefreshedAt: Date.now(), error: null }),

    setError: (error) => set({ error }),

    reset: () => set(initialState),
  }),
);
