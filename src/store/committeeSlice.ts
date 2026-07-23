import { create } from 'zustand'
import {
  computeParticipationRate,
  type SyncCommitteePeriodData,
} from '@/src/utils/syncCommittee'

type RequestStatus = 'idle' | 'loading' | 'loaded' | 'error'

function statusKey(validatorIndex: number, period: number): string {
  return `${validatorIndex}:${period}`
}

interface CommitteeState {
  /** periodsByValidator[validatorIndex][period] = data */
  periodsByValidator: Record<number, Record<number, SyncCommitteePeriodData>>
  /** Per (validator, period) request status. */
  status: Record<string, RequestStatus>
  /** Per (validator, period) error message. */
  errors: Record<string, string>

  setStatus: (validatorIndex: number, period: number, status: RequestStatus, error?: string) => void
  setPeriod: (data: SyncCommitteePeriodData) => void
  getPeriods: (validatorIndex: number) => SyncCommitteePeriodData[]
  getAggregateRate: (validatorIndex: number) => number
  reset: (validatorIndex: number) => void
}

export const useCommitteeStore = create<CommitteeState>((set, get) => ({
  periodsByValidator: {},
  status: {},
  errors: {},

  setStatus: (validatorIndex, period, status, error) =>
    set((s) => ({
      status: { ...s.status, [statusKey(validatorIndex, period)]: status },
      errors:
        error === undefined
          ? s.errors
          : { ...s.errors, [statusKey(validatorIndex, period)]: error },
    })),

  setPeriod: (data) =>
    set((s) => ({
      periodsByValidator: {
        ...s.periodsByValidator,
        [data.validatorIndex]: {
          ...(s.periodsByValidator[data.validatorIndex] ?? {}),
          [data.period]: data,
        },
      },
      status: { ...s.status, [statusKey(data.validatorIndex, data.period)]: 'loaded' },
    })),

  getPeriods: (validatorIndex) => {
    const byPeriod = get().periodsByValidator[validatorIndex]
    if (!byPeriod) return []
    return Object.values(byPeriod).sort((a, b) => a.period - b.period)
  },

  getAggregateRate: (validatorIndex) => {
    const periods = get().getPeriods(validatorIndex).filter((p) => p.assigned)
    let participated = 0
    let total = 0
    for (const p of periods) {
      participated += p.participatedCount
      total += p.totalSlots
    }
    return computeParticipationRate(participated, total)
  },

  reset: (validatorIndex) =>
    set((s) => {
      const periodsByValidator = { ...s.periodsByValidator }
      delete periodsByValidator[validatorIndex]
      return { periodsByValidator }
    }),
}))
