'use client'

import type { SyncCommitteeHistory } from '@/src/hooks/useSyncCommitteeHistory'

function formatRate(rate: number): string {
  return `${(rate * 100).toFixed(2)}%`
}

function rateTone(rate: number): string {
  if (rate >= 0.99) return 'text-emerald-400'
  if (rate >= 0.95) return 'text-amber-400'
  return 'text-red-400'
}

/**
 * Summary card for a validator's sync committee status: current selection,
 * aggregate participation rate across loaded history, and next assignment.
 */
export function SyncCommitteeSummary({
  validatorIndex,
  history,
}: {
  validatorIndex: number
  history: SyncCommitteeHistory
}) {
  const { currentPeriod, currentAssigned, aggregateRate, nextAssignmentEpoch, periods, isLoading, error } =
    history

  const assignedPeriods = periods.filter((p) => p.assigned)

  const selectionLabel =
    currentAssigned === null
      ? isLoading
        ? 'Loading…'
        : 'Unknown'
      : currentAssigned
        ? 'Serving'
        : 'Not selected'

  const selectionTone =
    currentAssigned === null ? 'text-slate-400' : currentAssigned ? 'text-emerald-400' : 'text-slate-300'

  return (
    <section className="rounded-3xl border border-white/10 bg-slate-900/80 p-6 text-white">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Sync Committee</h2>
          <p className="text-sm text-slate-400">Validator #{validatorIndex} · participation history</p>
        </div>
        <span
          className="rounded-full px-3 py-1 text-xs font-semibold"
          style={{
            backgroundColor: currentAssigned ? 'rgba(34,197,94,0.13)' : 'rgba(100,116,139,0.18)',
          }}
        >
          <span className={selectionTone}>{selectionLabel.toUpperCase()}</span>
        </span>
      </div>

      {error && <p className="mb-4 text-sm text-red-400">{error}</p>}

      <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <Metric label="Current period" value={currentPeriod ?? '—'} />
        <Metric
          label="Aggregate rate"
          value={periods.length ? formatRate(aggregateRate) : '—'}
          tone={periods.length ? rateTone(aggregateRate) : undefined}
        />
        <Metric label="Assigned periods" value={`${assignedPeriods.length} / ${periods.length}`} />
        <Metric
          label="Next assignment"
          value={nextAssignmentEpoch === null ? 'None scheduled' : `epoch ${nextAssignmentEpoch}`}
        />
      </div>
    </section>
  )
}

function Metric({
  label,
  value,
  tone = 'text-slate-100',
}: {
  label: string
  value: string | number
  tone?: string
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-slate-950/60 p-3">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 font-semibold ${tone}`}>{value}</p>
    </div>
  )
}
