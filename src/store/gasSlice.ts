import { create } from 'zustand';

interface GasState {
  currentBaseFee: number;
  stats: {
    hitRate: number;
    size: number;
    avgTtl: number;
    hits: number;
    misses: number;
  };
  setCurrentBaseFee: (fee: number) => void;
  recordHit: () => void;
  recordMiss: () => void;
  updateStats: (size: number, avgTtl: number) => void;
}

export const useGasStore = create<GasState>((set) => ({
  currentBaseFee: 20, // default dummy
  stats: { hitRate: 0, size: 0, avgTtl: 0, hits: 0, misses: 0 },
  setCurrentBaseFee: (fee) => set({ currentBaseFee: fee }),
  recordHit: () => set((state) => {
    const hits = state.stats.hits + 1;
    const total = hits + state.stats.misses;
    return { stats: { ...state.stats, hits, hitRate: total > 0 ? hits / total : 0 } };
  }),
  recordMiss: () => set((state) => {
    const misses = state.stats.misses + 1;
    const total = state.stats.hits + misses;
    return { stats: { ...state.stats, misses, hitRate: total > 0 ? state.stats.hits / total : 0 } };
  }),
  updateStats: (size, avgTtl) => set((state) => ({
    stats: { ...state.stats, size, avgTtl }
  }))
}));
