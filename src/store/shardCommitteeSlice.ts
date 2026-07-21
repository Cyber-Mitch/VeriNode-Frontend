import { create } from 'zustand'
import { RETENTION_EPOCHS, type EpochAssignments } from '@/src/types/committee'

/**
 * In-memory store for sharded committee assignments, mirroring the IndexedDB
 * history and bounded to the most recent RETENTION_EPOCHS (256) epochs.
 */
interface ShardCommitteeState {
  byEpoch: Record<number, EpochAssignments>
  latestEpoch: number | null
  setEpochAssignments: (data: EpochAssignments) => void
  setHistory: (epochs: EpochAssignments[]) => void
  getEpochs: () => number[]
  /** Shard a validator was assigned to per epoch (ascending by epoch). */
  getValidatorTimeline: (validatorIndex: number) => Array<{ epoch: number; shard: number }>
  reset: () => void
}

function prune(byEpoch: Record<number, EpochAssignments>): Record<number, EpochAssignments> {
  const epochs = Object.keys(byEpoch)
    .map(Number)
    .sort((a, b) => a - b)
  if (epochs.length <= RETENTION_EPOCHS) return byEpoch
  const drop = epochs.slice(0, epochs.length - RETENTION_EPOCHS)
  const next = { ...byEpoch }
  for (const e of drop) delete next[e]
  return next
}

export const useShardCommitteeStore = create<ShardCommitteeState>((set, get) => ({
  byEpoch: {},
  latestEpoch: null,

  setEpochAssignments: (data) =>
    set((s) => {
      const byEpoch = prune({ ...s.byEpoch, [data.epoch]: data })
      return {
        byEpoch,
        latestEpoch: Math.max(s.latestEpoch ?? data.epoch, data.epoch),
      }
    }),

  setHistory: (epochs) =>
    set(() => {
      const byEpoch: Record<number, EpochAssignments> = {}
      for (const ea of epochs) byEpoch[ea.epoch] = ea
      const pruned = prune(byEpoch)
      const keys = Object.keys(pruned).map(Number)
      return {
        byEpoch: pruned,
        latestEpoch: keys.length ? Math.max(...keys) : null,
      }
    }),

  getEpochs: () =>
    Object.keys(get().byEpoch)
      .map(Number)
      .sort((a, b) => a - b),

  getValidatorTimeline: (validatorIndex) => {
    const { byEpoch } = get()
    const timeline: Array<{ epoch: number; shard: number }> = []
    for (const epoch of Object.keys(byEpoch).map(Number).sort((a, b) => a - b)) {
      const found = byEpoch[epoch].assignments.find((a) => a.validatorIndex === validatorIndex)
      if (found) timeline.push({ epoch, shard: found.shard })
    }
    return timeline
  },

  reset: () => set({ byEpoch: {}, latestEpoch: null }),
}))
