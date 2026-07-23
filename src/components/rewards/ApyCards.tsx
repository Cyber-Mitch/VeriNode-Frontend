'use client'

import type { RewardHistorySummary } from '@/src/types/rewards'

interface ApyCardsProps {
  summary: RewardHistorySummary
}

function trendArrow(apy: number | null, network: number): { symbol: string; tone: string } {
  if (apy === null) return { symbol: '—', tone: 'text-slate-400' }
  if (apy >= network * 1.05) return { symbol: '↑', tone: 'text-emerald-400' }
  if (apy <= network * 0.95) return { symbol: '↓', tone: 'text-red-400' }
  return { symbol: '→', tone: 'text-amber-400' }
}

interface ApyCardProps {
  label: string
  apy: number | null
  networkAvg: number
}

function ApyCard({ label, apy, networkAvg }: ApyCardProps) {
  const trend = trendArrow(apy, networkAvg)

  return (
    <div className="rounded-xl border border-white/10 bg-slate-950/60 p-4">
      <p className="text-[11px] uppercase tracking-wide text-slate-500">{label} APY</p>
      <p className="mt-2 text-2xl font-semibold tabular-nums text-white">
        {apy !== null ? `${apy.toFixed(2)}%` : '—'}
        {apy !== null && (
          <span className={`ml-2 text-base ${trend.tone}`} aria-label="trend indicator">
            {trend.symbol}
          </span>
        )}
      </p>
      <p className="mt-1 text-xs text-slate-500">
        Network avg:{' '}
        <span
          className={
            apy !== null && apy >= networkAvg ? 'text-emerald-400' : 'text-slate-400'
          }
        >
          {networkAvg.toFixed(2)}%
        </span>
      </p>
    </div>
  )
}

/**
 * Three APY metric cards: trailing 7d, 30d, and 365d APY with trend
 * indicators and a comparison to the network average.
 */
export function ApyCards({ summary }: ApyCardsProps) {
  const { apy7d, apy30d, apy365d, networkAvgApy } = summary

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <ApyCard label="7d trailing" apy={apy7d} networkAvg={networkAvgApy} />
      <ApyCard label="30d trailing" apy={apy30d} networkAvg={networkAvgApy} />
      <ApyCard label="365d trailing" apy={apy365d} networkAvg={networkAvgApy} />
    </div>
  )
}
