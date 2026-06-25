'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  ReconciliationRecord,
  ReconciliationSummary,
  UnlockProjection,
  ValidatorBalanceSample,
} from '@/src/types/validator'
import { reconcile, reconcileSeries, summarize } from '@/src/utils/balanceReconciliation'
import { projectUnlock } from '@/src/utils/unlockProjection'
import { createDemoStakingService, createStakingService } from '@/src/services/stakingService'

/** Per-validator reconciliation history is capped at this many records (FIFO). */
export const MAX_HISTORY = 1000

interface UseReconciliationHistoryOptions {
  beaconNodeUrl?: string
  historyDepth?: number
}

export interface ReconciliationHistoryState {
  records: ReconciliationRecord[]
  summary: ReconciliationSummary
  projection: UnlockProjection
  isLoading: boolean
  error: string | null
  /** Append a fresh sample, reconciling it and evicting the oldest at the cap. */
  ingest: (sample: ValidatorBalanceSample) => void
}

/**
 * Maintains a single validator's reconciliation record history with FIFO
 * eviction at MAX_HISTORY (1,000) entries, plus a live `ingest` for streaming
 * new epoch samples. Exposes the aggregate summary and unlock projection.
 */
export function useReconciliationHistory(
  validatorIndex: number | null,
  options: UseReconciliationHistoryOptions = {},
): ReconciliationHistoryState {
  const { beaconNodeUrl, historyDepth = MAX_HISTORY } = options
  const cap = Math.min(historyDepth, MAX_HISTORY)

  const provider = useMemo(
    () => (beaconNodeUrl ? createStakingService(beaconNodeUrl) : createDemoStakingService()),
    [beaconNodeUrl],
  )

  const [records, setRecords] = useState<ReconciliationRecord[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const lastSampleRef = useRef<ValidatorBalanceSample | null>(null)

  // Clear stale records when the validator changes (adjust state during render).
  const [trackedValidator, setTrackedValidator] = useState<number | null | undefined>(undefined)
  if (trackedValidator !== validatorIndex) {
    setTrackedValidator(validatorIndex)
    setRecords([])
  }

  useEffect(() => {
    lastSampleRef.current = null
    if (validatorIndex === null) return

    let cancelled = false
    const run = async () => {
      setIsLoading(true)
      setError(null)
      try {
        const samples = await provider.fetchSamples(validatorIndex, cap)
        if (cancelled) return
        const windowed = samples.slice(-cap)
        const recs = reconcileSeries(windowed)
        lastSampleRef.current = windowed.length ? windowed[windowed.length - 1] : null
        setRecords(recs.slice(-cap))
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load reconciliation history')
        }
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    run()
    return () => {
      cancelled = true
    }
  }, [validatorIndex, provider, cap])

  const ingest = useCallback(
    (sample: ValidatorBalanceSample) => {
      const record = reconcile(lastSampleRef.current, sample)
      lastSampleRef.current = sample
      setRecords((prev) => {
        const next = [...prev, record]
        while (next.length > cap) next.shift()
        return next
      })
    },
    [cap],
  )

  const summary = useMemo(
    () => summarize(validatorIndex ?? -1, records),
    [validatorIndex, records],
  )
  const projection = useMemo(
    () => projectUnlock(validatorIndex ?? -1, records),
    [validatorIndex, records],
  )

  return { records, summary, projection, isLoading, error, ingest }
}
