'use client'

import { useEffect, useRef, useCallback } from 'react'
import { createConnectionPoolProbe } from '@/services/connectionPoolProbe'
import { useConnectionPoolStore } from '@/store/connectionPoolSlice'
import type { PoolProbeConfig } from '@/types/connectionPool'

const DEFAULT_PROBE_INTERVAL_MS = 30_000

export interface UseConnectionPoolHealthOptions {
  /** URL the probe will HEAD-request to measure latency. */
  probeUrl: string
  /** Pool configuration forwarded to `createConnectionPoolProbe`. */
  poolConfig?: PoolProbeConfig
  /**
   * How often to run the probe (ms).
   * @default 30_000
   */
  probeIntervalMs?: number
  /** When false the probe loop is suspended. @default true */
  enabled?: boolean
  /**
   * Current pool state supplier.  Provide this from your connection-pool
   * metrics API; in tests or demos a static object is fine.
   */
  getPoolState?: () => {
    totalConnections: number
    activeConnections: number
    waitingRequests: number
  }
}

/**
 * Hook that drives a `ConnectionPoolProbe` at a regular interval and feeds
 * results into `useConnectionPoolStore`.
 *
 * Returns the live snapshot and metrics from the store so components can
 * consume them directly.
 */
export function useConnectionPoolHealth({
  probeUrl,
  poolConfig,
  probeIntervalMs = DEFAULT_PROBE_INTERVAL_MS,
  enabled = true,
  getPoolState,
}: UseConnectionPoolHealthOptions) {
  const setSnapshot = useConnectionPoolStore((s) => s.setSnapshot)
  const setMetrics = useConnectionPoolStore((s) => s.setMetrics)
  const setProbing = useConnectionPoolStore((s) => s.setProbing)
  const snapshot = useConnectionPoolStore((s) => s.snapshot)
  const metrics = useConnectionPoolStore((s) => s.metrics)
  const probing = useConnectionPoolStore((s) => s.probing)

  // Stable probe instance across re-renders — only recreated when config changes.
  const probeRef = useRef(createConnectionPoolProbe(poolConfig))

  useEffect(() => {
    probeRef.current = createConnectionPoolProbe(poolConfig)
    probeRef.current.reset()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(poolConfig)])

  const runProbe = useCallback(async () => {
    if (!probeUrl) return
    const poolState = getPoolState
      ? getPoolState()
      : { totalConnections: 0, activeConnections: 0, waitingRequests: 0 }

    setProbing(true)
    try {
      const result = await probeRef.current.probe(probeUrl, poolState)
      setSnapshot(result)
      setMetrics(probeRef.current.getMetrics())
    } finally {
      setProbing(false)
    }
  }, [probeUrl, getPoolState, setSnapshot, setMetrics, setProbing])

  useEffect(() => {
    if (!enabled || !probeUrl) return

    // Run immediately on mount, then on schedule.
    runProbe()
    const interval = setInterval(runProbe, probeIntervalMs)
    return () => clearInterval(interval)
  }, [enabled, probeUrl, probeIntervalMs, runProbe])

  return { snapshot, metrics, probing }
}
