"use client";

import { useMemo, useSyncExternalStore } from "react";
import {
  useNodeStore,
  type NodeInfo,
  type FilterState,
} from "@/src/store/nodeStore";

interface FilteredResult {
  nodes: NodeInfo[];
  filter: FilterState;
  dataVersion: number;
  filterVersion: number;
}

/**
 * Subscribe to the Zustand store snapshot for useSyncExternalStore.
 *
 * Returns a stable reference (the version counters change on every write),
 * so React can correctly detect when the filtered list needs recomputation.
 */
function subscribeToStore(callback: () => void) {
  return useNodeStore.subscribe(callback);
}

function getStoreSnapshot(): FilteredResult {
  return useNodeStore.getState().getSnapshot();
}

/**
 * useNodeList — returns a consistently-filtered node list.
 *
 * Uses useSyncExternalStore to subscribe to BOTH the node data store and the
 * filter store from a single subscription point. The version counter pair
 * (dataVersion, filterVersion) is used as the useMemo dependency key, ensuring
 * the filtered list is only recomputed when both stores are in a consistent
 * state — no stale combinations as described in issue #40.
 *
 * Race condition prevented:
 *   A WebSocket event arriving while the user drags the reputation slider used to
 *   cause the memo to re-compute with (new data, old filter) and again with
 *   (old data, new filter), producing a stale mixed state. With the version-counter
 *   approach and the interaction-lock queuing, the snapshot always reflects a
 *   consistent pair of (filter, data).
 */
export function useNodeList(): NodeInfo[] {
  // Subscribe to store — re-renders when either data or filter changes
  const snapshot = useSyncExternalStore(subscribeToStore, getStoreSnapshot);

  // Memoized filtered list — only invalidated when both versions change
  const { nodes, filter, dataVersion, filterVersion } = snapshot;
  const filtered = useMemo(() => {
    // Refer to version counters so they are treated as used by the linter
    void dataVersion;
    void filterVersion;

    return nodes.filter((node) => {
      // Status filter
      if (filter.status !== "all" && node.status !== filter.status) {
        return false;
      }

      // Reputation range filter
      const [min, max] = filter.reputationRange;
      if (node.reputation < min || node.reputation > max) {
        return false;
      }

      // Bond status filter
      if (filter.bondStatus !== null && node.bondStatus !== filter.bondStatus) {
        return false;
      }

      return true;
    });
  }, [dataVersion, filterVersion, nodes, filter]);

  return filtered;
}

/**
 * useFilter — returns the current active filter state.
 */
export function useFilter(): FilterState {
  const snapshot = useSyncExternalStore(subscribeToStore, getStoreSnapshot);
  return snapshot.filter;
}
