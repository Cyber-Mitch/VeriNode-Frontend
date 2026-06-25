'use client'

import { useEffect, useMemo, useState } from 'react'
import type {
  ExitQueueProjection,
  NetworkQueueSnapshot,
  ValidatorQueuePosition,
} from '@/src/types/exitQueue'
import { useBeaconRPC } from '@/src/hooks/useBeaconRPC'
import { useBeaconStore } from '@/src/store/beaconSlice'
import { EPOCH_MS, currentEpoch, epochStartMs, msUntilNextEpoch } from '@/src/utils/epochTime'

const SLASHING_DELAY_EPOCHS = 4
/** Epochs of history to backfill on mount so the EWMA/trendline have data. */
const SEED_EPOCHS = 40

interface UseExitQueuePositionOptions {
  beaconNodeUrl?: string
}

export interface ExitQueuePositionState {
  projection: ExitQueueProjection | null
  position: ValidatorQueuePosition | null
  samples: NetworkQueueSnapshot[]
  ewmaSeries: number[]
  ewmaChurn: number
  isLoading: boolean
  error: string | null
}

/**
 * Polls the validator exit queue at epoch boundaries, feeds the shared
 * gap-interpolated / EWMA-smoothed history in the beacon store, and projects
 * the validator's exit epoch + ETA from its position and the EWMA churn rate.
 */
export function useExitQueuePosition(
  validatorIndex: number | null,
  options: UseExitQueuePositionOptions = {},
): ExitQueuePositionState {
  const rpc = useBeaconRPC(options.beaconNodeUrl)
  const ingest = useBeaconStore((s) => s.ingest)
  const samples = useBeaconStore((s) => s.samples)
  const ewmaSeries = useBeaconStore((s) => s.ewmaSeries)
  const ewmaChurn = useBeaconStore((s) => s.ewmaChurn)
  const latest = useBeaconStore((s) => s.latest)

  const [position, setPosition] = useState<ValidatorQueuePosition | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Clear stale position when the tracked validator changes (during render).
  const [tracked, setTracked] = useState<number | null | undefined>(undefined)
  if (tracked !== validatorIndex) {
    setTracked(validatorIndex)
    setPosition(null)
  }

  useEffect(() => {
    if (validatorIndex === null) return

    let cancelled = false
    let interval: number | undefined

    const poll = async (epoch: number) => {
      try {
        const reading = await rpc.getValidatorQueue(validatorIndex, epoch)
        if (cancelled) return
        ingest(reading.network)
        setPosition(reading.position)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to read exit queue')
      }
    }

    const run = async () => {
      setIsLoading(true)
      setError(null)
      const cur = currentEpoch(Date.now())
      for (let epoch = Math.max(0, cur - SEED_EPOCHS + 1); epoch <= cur; epoch++) {
        if (cancelled) return
        await poll(epoch)
      }
      if (!cancelled) setIsLoading(false)
    }

    run()

    // Poll exactly on each epoch boundary thereafter (≈6.4 min) to bound RPC load.
    const timeout = window.setTimeout(() => {
      poll(currentEpoch(Date.now()))
      interval = window.setInterval(() => poll(currentEpoch(Date.now())), EPOCH_MS)
    }, msUntilNextEpoch(Date.now()))

    return () => {
      cancelled = true
      window.clearTimeout(timeout)
      if (interval !== undefined) window.clearInterval(interval)
    }
  }, [validatorIndex, rpc, ingest])

  const projection = useMemo<ExitQueueProjection | null>(() => {
    if (!position) return null

    let epochsRemaining: number | null = null
    let projectedExitEpoch: number | null = null
    let projectedExitTimestamp: number | null = null

    if (ewmaChurn > 0) {
      epochsRemaining =
        Math.ceil(position.positionOffset / ewmaChurn) +
        (position.slashed ? SLASHING_DELAY_EPOCHS : 0)
      projectedExitEpoch = position.epoch + epochsRemaining
      projectedExitTimestamp = epochStartMs(projectedExitEpoch)
    }

    return {
      currentEpoch: position.epoch,
      positionOffset: position.positionOffset,
      queueDepth: latest?.queueDepth ?? 0,
      churnLimit: latest?.churnLimit ?? 0,
      ewmaChurn,
      slashed: position.slashed,
      epochsRemaining,
      projectedExitEpoch,
      projectedExitTimestamp,
    }
  }, [position, latest, ewmaChurn])

  return { projection, position, samples, ewmaSeries, ewmaChurn, isLoading, error }
}
