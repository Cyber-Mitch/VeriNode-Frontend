'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  SHARD_COUNT,
  type CommitteeAssignment,
  type ConcentrationResult,
  type EpochAssignments,
} from '@/src/types/committee'
import { computeConcentration } from '@/src/utils/concentrationRisk'
import { loadEpochHistory, saveEpochAssignments } from '@/src/services/committeeHistoryStore'
import { useShardCommitteeStore } from '@/src/store/shardCommitteeSlice'
import { currentEpoch, epochStartMs } from '@/src/utils/epochTime'

const DEFAULT_HISTORY_DEPTH = 32

interface UseCommitteeAssignmentsOptions {
  beaconNodeUrl?: string
  historyDepth?: number
}

export interface CommitteeAssignmentsState {
  /** Assignments for the currently viewed epoch. */
  current: EpochAssignments | null
  latestEpoch: number | null
  viewEpoch: number | null
  setViewEpoch: (epoch: number) => void
  epochs: number[]
  concentration: ConcentrationResult
  getValidatorTimeline: (validatorIndex: number) => Array<{ epoch: number; shard: number }>
  isLoading: boolean
  error: string | null
}

function fnv01(input: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0) / 0x1_0000_0000
}

/** Deterministic demo shard assignment for a validator at an epoch. */
function demoShard(validatorIndex: number, epoch: number): number {
  return Math.floor(fnv01(`shard:${validatorIndex}:${epoch}`) * SHARD_COUNT)
}

function demoAssignments(validatorIndices: number[], epoch: number): EpochAssignments {
  return {
    epoch,
    timestamp: epochStartMs(epoch),
    assignments: validatorIndices.map((validatorIndex) => ({
      validatorIndex,
      epoch,
      shard: demoShard(validatorIndex, epoch),
    })),
  }
}

async function fetchAssignments(
  beaconNodeUrl: string,
  validatorIndices: number[],
  epoch: number,
): Promise<EpochAssignments> {
  const base = beaconNodeUrl.replace(/\/$/, '')
  const response = await fetch(`${base}/eth/v1/beacon/states/head/committees?epoch=${epoch}`)
  if (!response.ok) throw new Error('Unable to fetch committee assignments')
  const body = (await response.json()) as {
    data?: Array<{ index?: string | number; validators?: Array<string | number> }>
  }
  const wanted = new Set(validatorIndices)
  const assignments: CommitteeAssignment[] = []
  for (const committee of body.data ?? []) {
    const shard = Number(committee.index ?? 0) % SHARD_COUNT
    for (const v of committee.validators ?? []) {
      const validatorIndex = Number(v)
      if (wanted.has(validatorIndex)) assignments.push({ validatorIndex, epoch, shard })
    }
  }
  return { epoch, timestamp: epochStartMs(epoch), assignments }
}

/**
 * Subscribes to per-epoch sharded committee assignments for an operator's
 * validators. Seeds recent history (persisted in IndexedDB, 256-epoch
 * retention), exposes the viewed epoch, and computes concentration risk.
 */
export function useCommitteeAssignments(
  validatorIndices: number[],
  options: UseCommitteeAssignmentsOptions = {},
): CommitteeAssignmentsState {
  const { beaconNodeUrl, historyDepth = DEFAULT_HISTORY_DEPTH } = options

  const byEpoch = useShardCommitteeStore((s) => s.byEpoch)
  const latestEpoch = useShardCommitteeStore((s) => s.latestEpoch)
  const setEpochAssignments = useShardCommitteeStore((s) => s.setEpochAssignments)
  const setHistory = useShardCommitteeStore((s) => s.setHistory)
  const getValidatorTimeline = useShardCommitteeStore((s) => s.getValidatorTimeline)

  const [viewEpoch, setViewEpoch] = useState<number | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const indicesKey = validatorIndices.join(',')

  useEffect(() => {
    const indices = indicesKey ? indicesKey.split(',').map(Number) : []
    if (indices.length === 0) return

    let cancelled = false
    const run = async () => {
      setIsLoading(true)
      setError(null)
      try {
        const persisted = await loadEpochHistory()
        if (cancelled) return
        if (persisted.length) setHistory(persisted)

        const cur = currentEpoch(Date.now())
        for (let epoch = Math.max(0, cur - historyDepth + 1); epoch <= cur; epoch++) {
          if (cancelled) return
          const ea = beaconNodeUrl
            ? await fetchAssignments(beaconNodeUrl, indices, epoch)
            : demoAssignments(indices, epoch)
          if (cancelled) return
          setEpochAssignments(ea)
          await saveEpochAssignments(ea)
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load assignments')
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    run()
    return () => {
      cancelled = true
    }
  }, [indicesKey, beaconNodeUrl, historyDepth, setEpochAssignments, setHistory])

  const effectiveEpoch = viewEpoch ?? latestEpoch
  const current = effectiveEpoch !== null ? (byEpoch[effectiveEpoch] ?? null) : null

  const epochs = useMemo(
    () =>
      Object.keys(byEpoch)
        .map(Number)
        .sort((a, b) => a - b),
    [byEpoch],
  )

  const concentration = useMemo(
    () => computeConcentration(current?.assignments ?? []),
    [current],
  )

  return {
    current,
    latestEpoch,
    viewEpoch: effectiveEpoch,
    setViewEpoch,
    epochs,
    concentration,
    getValidatorTimeline,
    isLoading,
    error,
  }
}
