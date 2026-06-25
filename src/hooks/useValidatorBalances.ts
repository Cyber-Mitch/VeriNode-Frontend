'use client'

import { useEffect, useMemo, useState } from 'react'
import type {
  ReconciliationRecord,
  ReconciliationSummary,
  UnlockProjection,
} from '@/src/types/validator'
import { reconcileSeries, summarize } from '@/src/utils/balanceReconciliation'
import { projectUnlock } from '@/src/utils/unlockProjection'
import { createDemoStakingService, createStakingService } from '@/src/services/stakingService'

/** Default history depth fetched per validator (FIFO-capped downstream). */
const DEFAULT_DEPTH = 1000

interface UseValidatorBalancesOptions {
  beaconNodeUrl?: string
  historyDepth?: number
}

/** Reconciled balance view for a single validator. */
export interface ValidatorReconciliation {
  records: ReconciliationRecord[]
  summary: ReconciliationSummary
  projection: UnlockProjection
}

export interface ValidatorBalancesState {
  byValidator: Record<number, ValidatorReconciliation>
  validators: number[]
  isLoading: boolean
  error: string | null
}

/**
 * Fetches balance samples for a set of validators and reconciles each into a
 * summary + unlock projection. This is the overview data source for the
 * reconciliation table; per-validator live history lives in
 * useReconciliationHistory.
 */
export function useValidatorBalances(
  validatorIndices: number[],
  options: UseValidatorBalancesOptions = {},
): ValidatorBalancesState {
  const { beaconNodeUrl, historyDepth = DEFAULT_DEPTH } = options

  const provider = useMemo(
    () => (beaconNodeUrl ? createStakingService(beaconNodeUrl) : createDemoStakingService()),
    [beaconNodeUrl],
  )

  const [byValidator, setByValidator] = useState<Record<number, ValidatorReconciliation>>({})
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Stable primitive dependency so the effect re-runs only on a real change.
  const indicesKey = validatorIndices.join(',')

  // Clear stale data when the validator set changes (adjust state during render).
  const [trackedKey, setTrackedKey] = useState<string | undefined>(undefined)
  if (trackedKey !== indicesKey) {
    setTrackedKey(indicesKey)
    setByValidator({})
  }

  useEffect(() => {
    const indices = indicesKey ? indicesKey.split(',').map(Number) : []
    if (indices.length === 0) return

    let cancelled = false
    const run = async () => {
      setIsLoading(true)
      setError(null)
      try {
        const entries = await Promise.all(
          indices.map(async (vi) => {
            const samples = (await provider.fetchSamples(vi, historyDepth)).slice(-historyDepth)
            const records = reconcileSeries(samples)
            const entry: ValidatorReconciliation = {
              records,
              summary: summarize(vi, records),
              projection: projectUnlock(vi, records),
            }
            return [vi, entry] as const
          }),
        )
        if (cancelled) return
        setByValidator(Object.fromEntries(entries))
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load validator balances')
        }
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    run()
    return () => {
      cancelled = true
    }
  }, [indicesKey, provider, historyDepth])

  const validators = useMemo(
    () => (indicesKey ? indicesKey.split(',').map(Number) : []),
    [indicesKey],
  )

  return { byValidator, validators, isLoading, error }
}
