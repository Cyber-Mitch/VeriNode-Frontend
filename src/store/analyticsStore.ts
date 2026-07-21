import { create } from 'zustand';
import type { AggregateResult, AnalyticsState } from '@/src/types/analytics';

interface AnalyticsStore extends AnalyticsState {
  setResult: (result: AggregateResult | null) => void;
  setProgress: (progress: number) => void;
  setComputing: (isComputing: boolean) => void;
  setError: (error: string | null) => void;
  reset: () => void;
}

const initialState: AnalyticsState = {
  result: null,
  progress: 0,
  isComputing: false,
  error: null,
};

export const useAnalyticsStore = create<AnalyticsStore>((set) => ({
  ...initialState,
  setResult: (result) => set({ result }),
  setProgress: (progress) => set({ progress }),
  setComputing: (isComputing) => set({ isComputing }),
  setError: (error) => set({ error }),
  reset: () => set(initialState),
}));
