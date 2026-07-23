import { create } from 'zustand';

export type NodeStatus = 'active' | 'slashed' | 'pending';

export interface NodeInfo {
  id: string;
  status: NodeStatus;
  reputation: number;
  bondStatus: boolean;
}

export interface FilterState {
  status: 'all' | NodeStatus;
  reputationRange: [number, number];
  bondStatus: boolean | null;
}

export interface QueuedUpdate {
  nodeId: string;
  status: NodeStatus;
}

interface NodeStore {
  // Data
  nodes: NodeInfo[];
  filter: FilterState;

  // Version counters — incremented on every write to their respective domain
  dataVersion: number;
  filterVersion: number;

  // Interaction lock: when true, WebSocket updates are queued, not applied
  isUserInteracting: boolean;
  pendingQueue: QueuedUpdate[];

  // Actions
  setNodes: (nodes: NodeInfo[]) => void;
  updateNodeStatus: (nodeId: string, status: NodeStatus) => void;
  setFilter: (filter: Partial<FilterState>) => void;
  setUserInteracting: (interacting: boolean) => void;
  flushPendingQueue: () => void;

  // Snapshot for useSyncExternalStore — both data and filter in one call
  getSnapshot: () => {
    nodes: NodeInfo[];
    filter: FilterState;
    dataVersion: number;
    filterVersion: number;
  };
}

const DEFAULT_FILTER: FilterState = {
  status: 'all',
  reputationRange: [0, 1000],
  bondStatus: null,
};

export const useNodeStore = create<NodeStore>((set, get) => ({
  nodes: [],
  filter: { ...DEFAULT_FILTER },
  dataVersion: 0,
  filterVersion: 0,
  isUserInteracting: false,
  pendingQueue: [],

  setNodes: (nodes) =>
    set((s) => ({
      nodes,
      dataVersion: s.dataVersion + 1,
    })),

  updateNodeStatus: (nodeId, newStatus) => {
    const { isUserInteracting } = get();

    // If user is actively interacting, queue the update instead
    if (isUserInteracting) {
      set((s) => ({
        pendingQueue: [...s.pendingQueue, { nodeId, status: newStatus }],
      }));
      return;
    }

    set((s) => ({
      nodes: s.nodes.map((n) =>
        n.id === nodeId ? { ...n, status: newStatus } : n,
      ),
      dataVersion: s.dataVersion + 1,
    }));
  },

  setFilter: (partial) =>
    set((s) => ({
      filter: { ...s.filter, ...partial },
      filterVersion: s.filterVersion + 1,
    })),

  setUserInteracting: (interacting) => {
    set({ isUserInteracting: interacting });
    // When interaction ends, flush the queue
    if (!interacting) {
      const { pendingQueue, nodes } = get();
      if (pendingQueue.length > 0) {
        const updatedNodes = [...nodes];
        for (const update of pendingQueue) {
          const idx = updatedNodes.findIndex((n) => n.id === update.nodeId);
          if (idx !== -1) {
            updatedNodes[idx] = { ...updatedNodes[idx], status: update.status };
          }
        }
        set({
          nodes: updatedNodes,
          pendingQueue: [],
          dataVersion: get().dataVersion + 1,
        });
      }
    }
  },

  flushPendingQueue: () => {
    const { pendingQueue, nodes } = get();
    if (pendingQueue.length === 0) return;
    const updatedNodes = [...nodes];
    for (const update of pendingQueue) {
      const idx = updatedNodes.findIndex((n) => n.id === update.nodeId);
      if (idx !== -1) {
        updatedNodes[idx] = { ...updatedNodes[idx], status: update.status };
      }
    }
    set({
      nodes: updatedNodes,
      pendingQueue: [],
      dataVersion: get().dataVersion + 1,
    });
  },

  getSnapshot: () => {
    const { nodes, filter, dataVersion, filterVersion } = get();
    return { nodes, filter, dataVersion, filterVersion };
  },
}));
