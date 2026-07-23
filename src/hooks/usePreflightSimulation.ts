'use client'

import { useEffect, useState } from 'react'
import type { SorobanTransaction } from '@/src/lib/stellar/transaction'
import { getFallbackEstimate, simulateTransaction, type SimulationResult } from '@/src/lib/api/simulate'
import { preflightCacheKey, usePreflightCache } from '@/src/hooks/usePreflightCache'

/** Maximum simulation time before showing a conservative estimate. */
export const PREFLIGHT_TIMEOUT_MS = 2000

export type PreflightStatus = 'idle' | 'loading' | 'success' | 'timeout' | 'fallback'

export interface PreflightState {
  result: SimulationResult | null
  status: PreflightStatus
  fromCache: boolean
  /** True when the 2s budget elapsed and a conservative estimate is shown. */
  timedOut: boolean
}

interface UsePreflightOptions {
  enabled?: boolean
  timeoutMs?: number
}

const IDLE: PreflightState = { result: null, status: 'idle', fromCache: false, timedOut: false }

/**
 * Orchestrates the pre-flight simulation lifecycle:
 *   cache hit → success · in-flight → loading · >2s → timeout (+fallback) ·
 *   RPC error → fallback. Successful results are cached for 60s.
 */
export function usePreflightSimulation(
  transaction: SorobanTransaction | null,
  options: UsePreflightOptions = {},
): PreflightState {
  const { enabled = true, timeoutMs = PREFLIGHT_TIMEOUT_MS } = options
  const cache = usePreflightCache()

  const [state, setState] = useState<PreflightState>(IDLE)

  // Reset to loading the moment the tracked transaction changes (during render).
  const xdr = transaction?.xdr
  const [trackedXdr, setTrackedXdr] = useState<string | undefined>(undefined)
  if (trackedXdr !== xdr) {
    setTrackedXdr(xdr)
    setState(xdr && enabled ? { ...IDLE, status: 'loading' } : IDLE)
  }

  useEffect(() => {
    if (!transaction || !enabled) return

    let cancelled = false
    let settled = false
    let timer: ReturnType<typeof setTimeout> | undefined

    const run = async () => {
      const key = await preflightCacheKey(transaction.xdr)
      if (cancelled) return

      const cached = cache.get(key)
      if (cached) {
        setState({ result: cached, status: 'success', fromCache: true, timedOut: false })
        return
      }

      setState({ result: null, status: 'loading', fromCache: false, timedOut: false })

      timer = setTimeout(() => {
        if (cancelled || settled) return
        setState((prev) =>
          prev.status === 'loading'
            ? { result: getFallbackEstimate(transaction), status: 'timeout', fromCache: false, timedOut: true }
            : prev,
        )
      }, timeoutMs)

      try {
        const result = await simulateTransaction(transaction)
        if (cancelled) return
        settled = true
        if (result.success) {
          cache.set(key, result)
          setState({ result, status: 'success', fromCache: false, timedOut: false })
        } else {
          setState({ result: getFallbackEstimate(transaction), status: 'fallback', fromCache: false, timedOut: false })
        }
      } catch {
        if (cancelled) return
        settled = true
        setState({ result: getFallbackEstimate(transaction), status: 'fallback', fromCache: false, timedOut: false })
      }
    }

    run()
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [transaction, enabled, timeoutMs, cache])

  return state
}
