'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  createBeaconSyncCommitteeService,
  createDemoSyncCommitteeService,
} from '@/src/services/beaconChainService'
import { getPeriod, pruneExpiredPeriods, savePeriod } from '@/src/services/syncCommitteeStore'
import { useCommitteeStore } from '@/src/store/committeeSlice'
import { periodStartEpoch, type SyncCommitteePeriodData } from '@/src/utils/syncCommittee'

interface UseSyncCommitteeHistoryOptions {
  /** Beacon node base URL; omit for the deterministic demo provider. */
  beaconNodeUrl?: string
  /** Number of recent periods to load up front (≥5 per the spec). */
  historyDepth?: number
}

export interface SyncCommitteeHistory {
  periods: SyncCommitteePeriodData[]
  currentPeriod: number | null
  /** Whether the validator is assigned to the current period. */
  currentAssigned: boolean | null
  /** Aggregate participation rate across all loaded assigned periods (0..1). */
  aggregateRate: number
  /** Epoch at which the validator's next sync committee duty begins, or null. */
  nextAssignmentEpoch: number | null
  isLoading: boolean
  error: string | null
  /** Lazily load an arbitrary period on demand. */
  loadPeriod: (period: number) => Promise<void>
}

/**
 * Tracks a validator's sync committee assignments and per-slot participation.
 * Data is loaded lazily — nothing fetches until a non-null `validatorIndex` is
 * provided — and cached in IndexedDB (7-day TTL) and the committee store.
 */
export function useSyncCommitteeHistory(
  validatorIndex: number | null,
  options: UseSyncCommitteeHistoryOptions = {},
): SyncCommitteeHistory {
  const { beaconNodeUrl, historyDepth = 5 } = options

  const provider = useMemo(
    () =>
      beaconNodeUrl
        ? createBeaconSyncCommitteeService(beaconNodeUrl)
        : createDemoSyncCommitteeService(),
    [beaconNodeUrl],
  )

  const setPeriod = useCommitteeStore((s) => s.setPeriod)
  const setStatus = useCommitteeStore((s) => s.setStatus)
  const periodsMap = useCommitteeStore((s) =>
    validatorIndex === null ? undefined : s.periodsByValidator[validatorIndex],
  )

  const [currentPeriod, setCurrentPeriod] = useState<number | null>(null)
  const [nextAssignmentEpoch, setNextAssignmentEpoch] = useState<number | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const periods = useMemo(
    () => (periodsMap ? Object.values(periodsMap).sort((a, b) => a.period - b.period) : []),
    [periodsMap],
  )

  const loadPeriod = useCallback(
    async (period: number) => {
      if (validatorIndex === null) return

      const store = useCommitteeStore.getState()
      if (store.periodsByValidator[validatorIndex]?.[period]) return // already in memory

      setStatus(validatorIndex, period, 'loading')
      try {
        const cached = await getPeriod(validatorIndex, period)
        if (cached) {
          setPeriod(cached)
          return
        }
        const data = await provider.fetchPeriodParticipation(validatorIndex, period)
        await savePeriod(data)
        setPeriod(data)
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load sync committee period'
        setStatus(validatorIndex, period, 'error', message)
        throw err
      }
    },
    [validatorIndex, provider, setPeriod, setStatus],
  )

  useEffect(() => {
    if (validatorIndex === null) {
      setCurrentPeriod(null)
      setNextAssignmentEpoch(null)
      return
    }

    let cancelled = false
    pruneExpiredPeriods().catch(console.error)

    const current = provider.getCurrentPeriod()
    setCurrentPeriod(current)
    setIsLoading(true)
    setError(null)

    const depth = Math.max(5, historyDepth)
    const targets: number[] = []
    for (let p = current - depth + 1; p <= current; p++) {
      if (p >= 0) targets.push(p)
    }

    ;(async () => {
      try {
        await Promise.all(targets.map((p) => loadPeriod(p)))
        const next = await provider.findNextAssignment(validatorIndex, current)
        if (!cancelled) setNextAssignmentEpoch(next === null ? null : periodStartEpoch(next))
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load sync committee history')
        }
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [validatorIndex, provider, historyDepth, loadPeriod])

  const currentAssigned = useMemo(() => {
    if (currentPeriod === null) return null
    const match = periods.find((p) => p.period === currentPeriod)
    return match ? match.assigned : null
  }, [periods, currentPeriod])

  const aggregateRate = useMemo(() => {
    let participated = 0
    let total = 0
    for (const p of periods) {
      if (!p.assigned) continue
      participated += p.participatedCount
      total += p.totalSlots
    }
    return total > 0 ? participated / total : 0
  }, [periods])

  return {
    periods,
    currentPeriod,
    currentAssigned,
    aggregateRate,
    nextAssignmentEpoch,
    isLoading,
    error,
    loadPeriod,
  }
}
