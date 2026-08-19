'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  ExitQueueProjection,
  NetworkQueueSnapshot,
  ValidatorQueuePosition,
} from '@/src/types/exitQueue'
import { useBeaconRPC } from '@/src/hooks/useBeaconRPC'
import { useBeaconStore } from '@/src/store/beaconSlice'
import { EPOCH_MS, currentEpoch, epochStartMs, msUntilNextEpoch } from '@/src/utils/epochTime'

const SLASHING_DELAY_EPOCHS = 4
const SEED_EPOCHS = 40
const NEAR_EXIT_THRESHOLD = 10

interface UseExitQueueOptions {
  beaconNodeUrl?: string
  /** Enable near-exit notifications (default: false). */
  notificationsEnabled?: boolean
}

export interface ExitQueueState {
  projection: ExitQueueProjection | null
  position: ValidatorQueuePosition | null
  samples: NetworkQueueSnapshot[]
  ewmaSeries: number[]
  ewmaChurn: number
  isLoading: boolean
  error: string | null
  /** Whether validator is within 10 positions of exit. */
  isNearExit: boolean
  /** Whether validator has exited (position <= 0). */
  hasExited: boolean
  notificationsEnabled: boolean
  toggleNotifications: () => void
}

/**
 * Unified exit queue hook: polls at epoch boundaries, feeds shared beacon
 * store, projects exit ETA, and surfaces near-exit + completion state for
 * alerting. Wraps `useExitQueuePosition` with notification toggle state.
 */
export function useExitQueue(
  validatorIndex: number | null,
  options: UseExitQueueOptions = {},
): ExitQueueState {
  const { beaconNodeUrl, notificationsEnabled: initialNotifications = false } = options

  const rpc = useBeaconRPC(beaconNodeUrl)
  const ingest = useBeaconStore((s) => s.ingest)
  const samples = useBeaconStore((s) => s.samples)
  const ewmaSeries = useBeaconStore((s) => s.ewmaSeries)
  const ewmaChurn = useBeaconStore((s) => s.ewmaChurn)
  const latest = useBeaconStore((s) => s.latest)

  const [position, setPosition] = useState<ValidatorQueuePosition | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notificationsEnabled, setNotificationsEnabled] = useState(initialNotifications)
  // useRef instead of useState so we can update it inside effects without
  // triggering a cascading re-render (fixes react-hooks/set-state-in-effect).
  const lastNotifiedPositionRef = useRef<number | null>(null)

  // Clear stale position when validator changes (during render).
  const [tracked, setTracked] = useState<number | null | undefined>(undefined)
  if (tracked !== validatorIndex) {
    setTracked(validatorIndex)
    setPosition(null)
    // Note: lastNotifiedPositionRef.current is reset inside the polling
    // useEffect below when validatorIndex changes, avoiding a ref write during render.
  }

  const isNearExit = useMemo(
    () => position !== null && position.positionOffset <= NEAR_EXIT_THRESHOLD && position.positionOffset > 0,
    [position],
  )

  const hasExited = useMemo(
    () => position !== null && position.positionOffset <= 0,
    [position],
  )

  // Send notification when near exit (once per crossing of threshold).
  useEffect(() => {
    if (!notificationsEnabled || !isNearExit || !position) return
    if (lastNotifiedPositionRef.current !== null && lastNotifiedPositionRef.current <= NEAR_EXIT_THRESHOLD) return

    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('Validator Near Exit', {
        body: `Validator #${validatorIndex} is within ${position.positionOffset} positions of exit`,
        icon: '/icons/icon-192x192.svg',
        tag: `exit-near-${validatorIndex}`,
      })
    }
    lastNotifiedPositionRef.current = position.positionOffset
  }, [isNearExit, notificationsEnabled, position, validatorIndex])

  // Send notification when exit complete (once).
  useEffect(() => {
    if (!notificationsEnabled || !hasExited || !position) return
    if (lastNotifiedPositionRef.current !== null && lastNotifiedPositionRef.current <= 0) return

    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('Validator Exit Complete', {
        body: `Validator #${validatorIndex} has successfully exited`,
        icon: '/icons/icon-192x192.svg',
        tag: `exit-complete-${validatorIndex}`,
      })
    }
    lastNotifiedPositionRef.current = 0
  }, [hasExited, notificationsEnabled, position, validatorIndex])

  const toggleNotifications = useCallback(async () => {
    if (!notificationsEnabled && 'Notification' in window) {
      // Request permission if not yet granted.
      if (Notification.permission === 'default') {
        const permission = await Notification.requestPermission()
        if (permission === 'granted') {
          setNotificationsEnabled(true)
        }
      } else if (Notification.permission === 'granted') {
        setNotificationsEnabled(true)
      }
    } else {
      setNotificationsEnabled(false)
    }
  }, [notificationsEnabled])

  useEffect(() => {
    if (validatorIndex === null) return

    // Reset notification tracking whenever the validator being watched changes.
    lastNotifiedPositionRef.current = null

    let cancelled = false
    let interval: number | undefined

    const poll = async (epoch: number) => {
      try {
        const reading = await rpc.getValidatorQueue(validatorIndex, epoch)
        if (cancelled) return
        ingest(reading.network)
        setPosition(reading.position)
        setError(null)
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

    // Poll at epoch boundaries (≈6.4 min).
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

  return {
    projection,
    position,
    samples,
    ewmaSeries,
    ewmaChurn,
    isLoading,
    error,
    isNearExit,
    hasExited,
    notificationsEnabled,
    toggleNotifications,
  }
}
