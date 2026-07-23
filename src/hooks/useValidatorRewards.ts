'use client'

import { useEffect, useMemo, useState } from 'react'
import type { DailyReward, RewardHistorySummary, RewardSource } from '@/src/types/rewards'

// ---------------------------------------------------------------------------
// Demo-data seed (deterministic, no network required in dev / storybook).
// ---------------------------------------------------------------------------

const SOURCES: RewardSource[] = ['proposal', 'attestation', 'sync']

function seededRng(seed: number): () => number {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffff_ffff
    return (s >>> 0) / 0xffff_ffff
  }
}

function buildDemoRecords(pubkey: string, days = 90): DailyReward[] {
  const rng = seededRng(pubkey.charCodeAt(0) * 31 + pubkey.length * 17)
  const records: DailyReward[] = []
  const now = Date.now()
  const DAY_MS = 86_400_000
  const BASE_ATT = 0.0005 // ~0.05% per day on 32 ETH

  for (let i = days - 1; i >= 0; i--) {
    const ts = now - i * DAY_MS
    const date = new Date(ts).toISOString().slice(0, 10)
    const noise = 0.8 + rng() * 0.4
    const hasProposal = rng() < 0.15 // ~15% chance of block proposal per day
    const hasSyncDuty = rng() < 0.2

    const attestation = BASE_ATT * noise
    const proposal = hasProposal ? attestation * 8 * rng() : 0
    const sync = hasSyncDuty ? attestation * 0.4 * rng() : 0
    const total = attestation + proposal + sync

    records.push({
      date,
      timestamp: ts,
      totalEth: parseFloat(total.toFixed(6)),
      breakdown: {
        proposal: parseFloat(proposal.toFixed(6)),
        attestation: parseFloat(attestation.toFixed(6)),
        sync: parseFloat(sync.toFixed(6)),
      },
      epoch: 200_000 + Math.floor(((days - 1 - i) * DAY_MS) / (6.4 * 60 * 1000)),
      blockNumber: hasProposal ? 19_000_000 + Math.floor(rng() * 1_000_000) : 0,
      txHash: hasProposal
        ? `0x${Array.from({ length: 64 }, () => Math.floor(rng() * 16).toString(16)).join('')}`
        : '',
    })
  }
  return records
}

// ---------------------------------------------------------------------------
// APY calculation helpers
// ---------------------------------------------------------------------------

/** Trailing APY: (total_rewards_N_days / staked_balance) * (365 / N) * 100. */
function trailingApy(records: DailyReward[], days: number, stakedEth: number): number | null {
  if (stakedEth <= 0 || records.length === 0) return null
  const slice = records.slice(-days)
  if (slice.length === 0) return null
  const total = slice.reduce((s, r) => s + r.totalEth, 0)
  return (total / stakedEth) * (365 / slice.length) * 100
}

// ---------------------------------------------------------------------------
// API fetch (falls back to demo data when the endpoint is absent).
// ---------------------------------------------------------------------------

async function fetchRewards(pubkey: string): Promise<DailyReward[]> {
  try {
    const res = await fetch(`/api/v1/validators/${encodeURIComponent(pubkey)}/rewards`)
    if (!res.ok) throw new Error(`${res.status}`)
    const body = await res.json()
    return (body as { data: DailyReward[] }).data
  } catch {
    // API not yet deployed — use deterministic demo data.
    return buildDemoRecords(pubkey)
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export interface UseValidatorRewardsState {
  summary: RewardHistorySummary | null
  isLoading: boolean
  error: string | null
}

/**
 * Fetches daily reward history for a validator pubkey from
 * `/api/v1/validators/{pubkey}/rewards` and computes APY metrics.
 * Falls back to deterministic demo data when the endpoint is unavailable.
 */
export function useValidatorRewards(pubkey: string | null): UseValidatorRewardsState {
  const [records, setRecords] = useState<DailyReward[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Clear stale data when pubkey changes (during render).
  const [trackedPubkey, setTrackedPubkey] = useState<string | null | undefined>(undefined)
  if (trackedPubkey !== pubkey) {
    setTrackedPubkey(pubkey)
    setRecords([])
  }

  useEffect(() => {
    if (!pubkey) return
    let cancelled = false
    const run = async () => {
      setIsLoading(true)
      setError(null)
      try {
        const data = await fetchRewards(pubkey)
        if (!cancelled) setRecords(data)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load rewards')
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }
    run()
    return () => {
      cancelled = true
    }
  }, [pubkey])

  const summary = useMemo<RewardHistorySummary | null>(() => {
    if (records.length === 0) return null

    // Staked balance fixed at 32 ETH per validator (standard value).
    const stakedBalanceEth = 32

    const cumulativeSeries: number[] = []
    let running = 0
    for (const r of records) {
      running += r.totalEth
      cumulativeSeries.push(parseFloat(running.toFixed(6)))
    }

    return {
      records,
      cumulativeSeries,
      apy7d: trailingApy(records, 7, stakedBalanceEth),
      apy30d: trailingApy(records, 30, stakedBalanceEth),
      apy365d: trailingApy(records, 365, stakedBalanceEth),
      // Network average APY: ~3.8% is a reasonable Ethereum mainnet estimate.
      networkAvgApy: 3.8,
      totalRewardsEth: parseFloat(running.toFixed(6)),
      stakedBalanceEth,
    }
  }, [records])

  return { summary, isLoading, error }
}

export { SOURCES }
