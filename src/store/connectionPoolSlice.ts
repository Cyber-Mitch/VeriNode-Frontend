import { create } from 'zustand'
import type { PoolHealthSnapshot, PoolHealthMetrics } from '@/types/connectionPool'

interface ConnectionPoolState {
  snapshot: PoolHealthSnapshot | null
  metrics: PoolHealthMetrics | null
  /** Whether a probe is currently in flight. */
  probing: boolean
  setSnapshot: (snapshot: PoolHealthSnapshot) => void
  setMetrics: (metrics: PoolHealthMetrics) => void
  setProbing: (probing: boolean) => void
  reset: () => void
}

export const useConnectionPoolStore = create<ConnectionPoolState>((set) => ({
  snapshot: null,
  metrics: null,
  probing: false,
  setSnapshot: (snapshot) => set({ snapshot }),
  setMetrics: (metrics) => set({ metrics }),
  setProbing: (probing) => set({ probing }),
  reset: () => set({ snapshot: null, metrics: null, probing: false }),
}))
