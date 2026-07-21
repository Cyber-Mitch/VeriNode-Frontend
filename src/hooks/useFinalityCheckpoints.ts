'use client'

import { useEffect, useRef, useState } from 'react'
import { calculateFinalityHealthScore, type FinalityCheckpointInput, type FinalityHealthSnapshot, type FinalityScoreState } from '@/src/utils/compositeScore'
import { createBeaconChainService, createDemoBeaconChainService } from '@/src/services/beaconChainService'
import { useHealthStore } from '@/src/store/healthSlice'
import { createFinalityHealthChannel } from '@/src/utils/crossTabSync'
import { pruneFinalityHealthHistory, saveFinalityHealthSnapshot } from '@/src/services/healthHistoryStore'

const SLOT_INTERVAL_MS = 12_000
const GC_INTERVAL_MS = 60 * 60 * 1000

export function useFinalityCheckpoints(beaconNodeUrl?: string) {
  const [snapshot, setSnapshot] = useState<FinalityHealthSnapshot | null>(null)
  const setFinalityHealth = useHealthStore((state) => state.setFinalityHealth)
  const scoreState = useRef<FinalityScoreState>({ lastFinalizedEpoch: null, stalledSlots: 0 })
  const frameRef = useRef<number | null>(null)
  const pendingRef = useRef<FinalityHealthSnapshot | null>(null)

  useEffect(() => {
    const channel = createFinalityHealthChannel((incoming) => {
      pendingRef.current = incoming
      if (frameRef.current === null) {
        frameRef.current = requestAnimationFrame(() => {
          frameRef.current = null
          if (pendingRef.current) setSnapshot(pendingRef.current)
        })
      }
    })

    function publishCheckpoint(input: FinalityCheckpointInput) {
      const result = calculateFinalityHealthScore(input, scoreState.current)
      scoreState.current = result.state
      pendingRef.current = result.snapshot
      channel.publish(result.snapshot)
      setFinalityHealth(result.snapshot)
      saveFinalityHealthSnapshot(result.snapshot).catch(console.error)

      if (frameRef.current === null) {
        frameRef.current = requestAnimationFrame(() => {
          frameRef.current = null
          if (pendingRef.current) setSnapshot(pendingRef.current)
        })
      }
    }

    const provider = beaconNodeUrl ? createBeaconChainService(beaconNodeUrl) : createDemoBeaconChainService()
    let slot = Math.floor(Date.now() / SLOT_INTERVAL_MS)
    provider.fetchCheckpoint(slot).then(publishCheckpoint).catch(console.error)
    const interval = window.setInterval(() => {
      provider.fetchCheckpoint(++slot).then(publishCheckpoint).catch(console.error)
    }, SLOT_INTERVAL_MS)
    const gcInterval = window.setInterval(() => pruneFinalityHealthHistory().catch(console.error), GC_INTERVAL_MS)
    pruneFinalityHealthHistory().catch(console.error)

    const unsubscribeHead = beaconNodeUrl ? provider.subscribeToHead(publishCheckpoint) : () => undefined

    return () => {
      window.clearInterval(interval)
      window.clearInterval(gcInterval)
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
      unsubscribeHead()
      channel.close()
    }
  }, [beaconNodeUrl, setFinalityHealth])

  return snapshot
}
