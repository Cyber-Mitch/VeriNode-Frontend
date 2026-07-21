'use client'

import { formatEth } from '@/src/utils/balanceMath'
import { useReconciliationHistory, MAX_HISTORY } from '@/src/hooks/useReconciliationHistory'

function formatDate(ms: number | null): string {
  if (ms === null) return '—'
  return new Date(ms).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

function formatDays(days: number | null): string {
  if (days === null) return '—'
  if (days >= 365) return `${(days / 365).toFixed(1)} yr`
  return `${days.toFixed(1)} d`
}

/**
 * Projected-unlock timeline for a single (capped) validator. Shows the excess
 * over the cap, the trailing reward rate driving the estimate, and the ETA
 * with its ±15% error bounds. Non-capped validators render a quiet placeholder.
 */
export function ValidatorUnlockCard({
  validatorIndex,
  beaconNodeUrl,
}: {
  validatorIndex: number
  beaconNodeUrl?: string
}) {
  const { projection, records, isLoading } = useReconciliationHistory(validatorIndex, { beaconNodeUrl })

  return (
    <section className="rounded-2xl border border-white/10 bg-slate-900/70 p-5 text-white">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h4 className="font-mono text-sm font-semibold">Validator #{validatorIndex}</h4>
          <p className="text-xs text-slate-500">
            {records.length}/{MAX_HISTORY} records
          </p>
        </div>
        <span
          className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${
            projection.capped ? 'bg-amber-500/15 text-amber-400' : 'bg-slate-700/40 text-slate-400'
          }`}
        >
          {projection.capped ? 'CAPPED' : 'UNCAPPED'}
        </span>
      </div>

      {isLoading && records.length === 0 ? (
        <p className="py-4 text-center text-sm text-slate-400">Projecting…</p>
      ) : !projection.capped ? (
        <p className="py-4 text-sm text-slate-400">
          Balance is at or below the effective-balance cap — no unlock projection.
        </p>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <Stat label="Excess over cap" value={`${formatEth(projection.excessGwei)} ETH`} />
            <Stat label="Avg reward / day" value={`${formatEth(projection.avgDailyRewardGwei, 6)} ETH`} />
            <Stat label="Projected ETA" value={formatDays(projection.etaDays)} tone="text-sky-300" />
            <Stat label="Unlock date" value={formatDate(projection.unlockDate)} tone="text-sky-300" />
          </div>

          <div className="rounded-xl border border-white/10 bg-slate-950/60 p-3 text-xs text-slate-400">
            <p className="mb-1 font-medium text-slate-300">±15% error bounds</p>
            <div className="flex items-center justify-between">
              <span>{formatDate(projection.unlockDateLow)}</span>
              <span className="text-slate-600">→</span>
              <span>{formatDate(projection.unlockDateHigh)}</span>
            </div>
            <div className="mt-1 flex items-center justify-between text-slate-500">
              <span>{formatDays(projection.etaDaysLow)}</span>
              <span>{formatDays(projection.etaDaysHigh)}</span>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

function Stat({ label, value, tone = 'text-slate-100' }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-slate-950/60 p-3">
      <p className="text-[11px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 font-semibold ${tone}`}>{value}</p>
    </div>
  )
}
