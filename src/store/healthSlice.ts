import { create } from 'zustand'
import type { FinalityHealthSnapshot } from '@/src/utils/compositeScore'

type HealthState = {
  finalityHealth: FinalityHealthSnapshot | null
  setFinalityHealth: (snapshot: FinalityHealthSnapshot) => void
}

export const useHealthStore = create<HealthState>((set) => ({
  finalityHealth: null,
  setFinalityHealth: (snapshot) => set({ finalityHealth: snapshot }),
}))
