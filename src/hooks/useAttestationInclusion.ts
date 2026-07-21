'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  binDelays,
  computeDelay,
  type AttestationInclusion,
  type DelayHistogram,
  type HistogramWorkerResponse,
} from '@/src/utils/histogramBinner'
import { GENESIS_TIME, SECONDS_PER_SLOT, SLOTS_PER_EPOCH } from '@/src/utils/syncCommittee'

/** Maximum epochs retained in the ring buffer (configurable upper bound). */
export const MAX_EPOCHS = 2048
/** Minimum epochs per zoomed view. */
export const MIN_SPAN = 8
const DEFAULT_SPAN = 64
const LIVE_INTERVAL_MS = 6000

interface UseAttestationInclusionOptions {
  beaconNodeUrl?: string
  maxEpochs?: number
  /** Append a new synthetic epoch on an interval (demo only). */
  live?: boolean
}

export interface AttestationInclusionState {
  records: AttestationInclusion[]
  histogram: DelayHistogram | null
  /** Current [fromEpoch, toEpoch] view range (inclusive). */
  range: [number, number]
  setRange: (from: number, to: number) => void
  minEpoch: number
  maxEpoch: number
  currentEpoch: number | null
  isComputing: boolean
  error: string | null
}

// ---- deterministic demo data --------------------------------------------

function fnv01(input: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0) / 0x1_0000_0000
}

function demoDelay(validatorIndex: number, epoch: number): number {
  const r = fnv01(`delay:${validatorIndex}:${epoch}`)
  if (r < 0.7) return 1 // optimal — included next slot
  if (r < 0.9) return 2
  if (r < 0.97) return 3
  return 4 + Math.floor(fnv01(`tail:${validatorIndex}:${epoch}`) * 12) // occasional long tail
}

function demoRecord(validatorIndex: number, epoch: number): AttestationInclusion {
  const attesterSlotOffset = Math.floor(fnv01(`off:${validatorIndex}:${epoch}`) * SLOTS_PER_EPOCH)
  const delay = demoDelay(validatorIndex, epoch)
  return {
    epoch,
    attesterSlotOffset,
    inclusionSlot: epoch * SLOTS_PER_EPOCH + attesterSlotOffset + delay,
  }
}

function epochAt(nowMs: number): number {
  const slot = Math.max(0, Math.floor((nowMs / 1000 - GENESIS_TIME) / SECONDS_PER_SLOT))
  return Math.floor(slot / SLOTS_PER_EPOCH)
}

/** Build the initial ring buffer of inclusion records ending at the current epoch. */
function buildSeed(validatorIndex: number | null, maxEpochs: number): AttestationInclusion[] {
  if (validatorIndex === null) return []
  const cur = epochAt(Date.now())
  const start = Math.max(0, cur - maxEpochs + 1)
  const seeded: AttestationInclusion[] = []
  for (let epoch = start; epoch <= cur; epoch++) {
    seeded.push(demoRecord(validatorIndex, epoch))
  }
  return seeded
}

function defaultRange(records: AttestationInclusion[]): [number, number] {
  if (records.length === 0) return [0, 0]
  const cur = records[records.length - 1].epoch
  const min = records[0].epoch
  return [Math.max(min, cur - DEFAULT_SPAN + 1), cur]
}

function createWorker(): Worker | null {
  try {
    return new Worker(new URL('../workers/histogramRendererWorker.ts', import.meta.url))
  } catch {
    return null
  }
}

/**
 * Maintains a ring buffer of the most recent inclusion records for a validator
 * and computes the inclusion-delay histogram for a configurable epoch range,
 * binning off the main thread via a web worker (with a main-thread fallback).
 */
export function useAttestationInclusion(
  validatorIndex: number | null,
  options: UseAttestationInclusionOptions = {},
): AttestationInclusionState {
  const { beaconNodeUrl, maxEpochs = MAX_EPOCHS, live = !beaconNodeUrl } = options

  const [records, setRecords] = useState<AttestationInclusion[]>([])
  const [range, setRangeState] = useState<[number, number]>([0, 0])
  const [histogram, setHistogram] = useState<DelayHistogram | null>(null)
  const [isComputing, setIsComputing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [trackedValidator, setTrackedValidator] = useState<number | null | undefined>(undefined)

  const workerRef = useRef<Worker | null>(null)
  const requestIdRef = useRef(0)
  const pendingRef = useRef<string | null>(null)

  // (Re)seed the ring buffer when the validator (or source) changes, adjusting
  // state during render rather than in an effect.
  if (trackedValidator !== validatorIndex) {
    setTrackedValidator(validatorIndex)
    const seed = buildSeed(validatorIndex, maxEpochs)
    setRecords(seed)
    setRangeState(defaultRange(seed))
    setError(null)
  }

  // Worker lifecycle.
  useEffect(() => {
    const worker = createWorker()
    workerRef.current = worker

    const handler = (e: MessageEvent<HistogramWorkerResponse>) => {
      const msg = e.data
      if (msg.payload.requestId !== pendingRef.current) return
      if (msg.type === 'RESULT') {
        setHistogram(msg.payload.histogram)
        setIsComputing(false)
      } else if (msg.type === 'ERROR') {
        setError(msg.payload.message)
        setIsComputing(false)
      }
    }

    worker?.addEventListener('message', handler)
    return () => {
      worker?.removeEventListener('message', handler)
      worker?.terminate()
    }
  }, [])

  // Demo stream: append a fresh epoch on an interval, evicting the oldest.
  useEffect(() => {
    if (!live || validatorIndex === null) return
    const interval = window.setInterval(() => {
      setRecords((prev) => {
        if (prev.length === 0) return prev
        const nextEpoch = prev[prev.length - 1].epoch + 1
        const appended = [...prev, demoRecord(validatorIndex, nextEpoch)]
        while (appended.length > maxEpochs) appended.shift()
        return appended
      })
    }, LIVE_INTERVAL_MS)
    return () => window.clearInterval(interval)
  }, [live, validatorIndex, maxEpochs])

  // Recompute the histogram whenever the records or range change. The work is
  // scheduled on the next frame (coalescing rapid slider drags) and binning is
  // offloaded to the worker; the empty case naturally yields an empty result.
  useEffect(() => {
    let cancelled = false

    const compute = () => {
      if (cancelled) return
      const [from, to] = range
      const delays: number[] = []
      for (const r of records) {
        if (r.epoch >= from && r.epoch <= to) delays.push(computeDelay(r))
      }

      const worker = workerRef.current
      if (worker) {
        const requestId = `hist-${++requestIdRef.current}`
        pendingRef.current = requestId
        setIsComputing(true)
        const payload = Float64Array.from(delays)
        worker.postMessage({ type: 'COMPUTE', payload: { requestId, delays: payload } }, [payload.buffer])
      } else {
        setHistogram(binDelays(delays))
      }
    }

    const raf = requestAnimationFrame(compute)
    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
    }
  }, [records, range])

  const minEpoch = records.length ? records[0].epoch : 0
  const maxEpoch = records.length ? records[records.length - 1].epoch : 0
  const currentEpoch = records.length ? records[records.length - 1].epoch : null

  const setRange = useCallback(
    (from: number, to: number) => {
      setRangeState(() => {
        let lo = Math.max(minEpoch, Math.min(from, to))
        let hi = Math.min(maxEpoch, Math.max(from, to))
        if (hi - lo + 1 < MIN_SPAN) {
          hi = Math.min(maxEpoch, lo + MIN_SPAN - 1)
          lo = Math.max(minEpoch, hi - MIN_SPAN + 1)
        }
        return [lo, hi]
      })
    },
    [minEpoch, maxEpoch],
  )

  return useMemo(
    () => ({
      records,
      histogram,
      range,
      setRange,
      minEpoch,
      maxEpoch,
      currentEpoch,
      isComputing,
      error,
    }),
    [records, histogram, range, setRange, minEpoch, maxEpoch, currentEpoch, isComputing, error],
  )
}
