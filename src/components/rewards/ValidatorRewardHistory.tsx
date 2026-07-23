'use client'

import { useState } from 'react'
import { useValidatorRewards } from '@/src/hooks/useValidatorRewards'
import { RewardsChart } from '@/src/components/rewards/RewardsChart'
import { ApyCards } from '@/src/components/rewards/ApyCards'
import { ApyCalculator } from '@/src/components/rewards/ApyCalculator'
import { RewardHistoryTable } from '@/src/components/rewards/RewardHistoryTable'
import { ExportButton } from '@/src/components/rewards/ExportButton'

interface ValidatorRewardHistoryProps {
  /** Validator BLS public key (hex). Passed to the rewards API. */
  pubkey: string
}

/**
 * Full validator reward history dashboard:
 * - APY metric cards (7d / 30d / 365d) with trend indicators
 * - Rewards chart (cumulative area / daily stacked bar)
 * - APY calculator with sliders
 * - Paginated reward history table
 * - CSV export button
 *
 * Connects to `useValidatorRewards` which fetches from
 * `/api/v1/validators/{pubkey}/rewards` and falls back to demo data.
 */
export function ValidatorRewardHistory({ pubkey }: ValidatorRewardHistoryProps) {
  const [chartOpen, setChartOpen] = useState(true)
  const [calcOpen, setCalcOpen] = useState(true)
  const [tableOpen, setTableOpen] = useState(true)

  const { summary, isLoading, error } = useValidatorRewards(pubkey)

  return (
    <div className="space-y-6">
      {/* ------------------------------------------------------------------ */}
      {/* Header metrics                                                       */}
      {/* ------------------------------------------------------------------ */}
      <section className="overflow-hidden rounded-3xl border border-white/10 bg-slate-900/80 text-white">
        <div className="flex items-center justify-between p-6">
          <div>
            <h2 className="text-xl font-semibold">Reward History</h2>
            <p className="text-sm text-slate-400">
              {pubkey.slice(0, 12)}…{pubkey.slice(-6)} · trailing APY &amp; earnings
            </p>
          </div>

          <div className="flex items-center gap-3">
            {summary && (
              <ExportButton records={summary.records} pubkey={pubkey} />
            )}
            <span className="rounded-full bg-sky-500/10 px-3 py-1 text-xs font-semibold text-sky-300">
              {summary ? `${summary.records.length} days` : isLoading ? 'Loading…' : '0 days'}
            </span>
          </div>
        </div>

        {error && (
          <p className="mx-6 mb-4 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-400">
            {error}
          </p>
        )}

        {isLoading && !summary ? (
          <p className="px-6 pb-8 text-center text-sm text-slate-400">Loading reward history…</p>
        ) : summary ? (
          <div className="space-y-5 px-6 pb-6">
            {/* Summary stats row */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <StatCard
                label="Total earned"
                value={`${summary.totalRewardsEth.toFixed(6)}`}
                unit="ETH"
                tone="text-emerald-400"
              />
              <StatCard
                label="Staked balance"
                value={`${summary.stakedBalanceEth}`}
                unit="ETH"
              />
              <StatCard
                label="Avg daily"
                value={
                  summary.records.length > 0
                    ? (summary.totalRewardsEth / summary.records.length).toFixed(6)
                    : '0.000000'
                }
                unit="ETH"
              />
            </div>

            {/* APY cards */}
            <ApyCards summary={summary} />
          </div>
        ) : null}
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Rewards chart accordion                                             */}
      {/* ------------------------------------------------------------------ */}
      <section className="overflow-hidden rounded-3xl border border-white/10 bg-slate-900/80 text-white">
        <button
          type="button"
          onClick={() => setChartOpen((o) => !o)}
          className="flex w-full items-center justify-between gap-4 p-6 text-left"
          aria-expanded={chartOpen}
        >
          <div>
            <h2 className="text-xl font-semibold">Earnings Chart</h2>
            <p className="text-sm text-slate-400">
              Cumulative rewards &amp; daily breakdown by source
            </p>
          </div>
          <span className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 text-lg text-slate-300">
            {chartOpen ? '−' : '+'}
          </span>
        </button>

        {chartOpen && (
          <div className="px-6 pb-6">
            {summary ? (
              <RewardsChart
                records={summary.records}
                cumulativeSeries={summary.cumulativeSeries}
              />
            ) : (
              <div className="flex h-40 items-center justify-center text-sm text-slate-400">
                {isLoading ? 'Loading…' : 'No data.'}
              </div>
            )}
          </div>
        )}
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* APY calculator accordion                                            */}
      {/* ------------------------------------------------------------------ */}
      <section className="overflow-hidden rounded-3xl border border-white/10 bg-slate-900/80 text-white">
        <button
          type="button"
          onClick={() => setCalcOpen((o) => !o)}
          className="flex w-full items-center justify-between gap-4 p-6 text-left"
          aria-expanded={calcOpen}
        >
          <div>
            <h2 className="text-xl font-semibold">APY Calculator</h2>
            <p className="text-sm text-slate-400">
              Project future earnings at different network conditions
            </p>
          </div>
          <span className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 text-lg text-slate-300">
            {calcOpen ? '−' : '+'}
          </span>
        </button>

        {calcOpen && (
          <div className="px-6 pb-6">
            <ApyCalculator />
          </div>
        )}
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Reward history table accordion                                      */}
      {/* ------------------------------------------------------------------ */}
      <section className="overflow-hidden rounded-3xl border border-white/10 bg-slate-900/80 text-white">
        <button
          type="button"
          onClick={() => setTableOpen((o) => !o)}
          className="flex w-full items-center justify-between gap-4 p-6 text-left"
          aria-expanded={tableOpen}
        >
          <div>
            <h2 className="text-xl font-semibold">Reward History</h2>
            <p className="text-sm text-slate-400">
              Daily records · date, amount, source, epoch, tx hash
            </p>
          </div>
          <span className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 text-lg text-slate-300">
            {tableOpen ? '−' : '+'}
          </span>
        </button>

        {tableOpen && (
          <div className="px-6 pb-6">
            {summary ? (
              <RewardHistoryTable records={summary.records} />
            ) : (
              <p className="py-8 text-center text-sm text-slate-400">
                {isLoading ? 'Loading…' : 'No records.'}
              </p>
            )}
          </div>
        )}
      </section>
    </div>
  )
}

function StatCard({
  label,
  value,
  unit,
  tone = 'text-slate-100',
}: {
  label: string
  value: string
  unit?: string
  tone?: string
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-slate-950/60 p-3">
      <p className="text-[11px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 font-semibold tabular-nums ${tone}`}>
        {value}
        {unit && <span className="ml-1 text-xs text-slate-500">{unit}</span>}
      </p>
    </div>
  )
}
