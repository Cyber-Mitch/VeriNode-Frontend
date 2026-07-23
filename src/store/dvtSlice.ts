import { create } from 'zustand'
import type { DVTClusterHealth } from '@/src/hooks/useDVTClusterHealth'

type DVTState = {
  clusters: DVTClusterHealth[]
  lastUpdated: number | null
  setClusters: (clusters: DVTClusterHealth[]) => void
}

export const useDVTStore = create<DVTState>((set) => ({
  clusters: [],
  lastUpdated: null,
  setClusters: (clusters) => set({ clusters, lastUpdated: Date.now() }),
}))
