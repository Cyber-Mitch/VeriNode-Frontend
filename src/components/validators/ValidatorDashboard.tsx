'use client'

import { useMemo, useState } from 'react'
import { BalanceReconciliationTable } from '@/src/components/validators/BalanceReconciliationTable'
import { ValidatorUnlockCard } from '@/src/components/validators/ValidatorUnlockCard'
import { ExitQueuePositionCard } from '@/src/components/validators/ExitQueuePositionCard'
import dynamic from 'next/dynamic'
import { ChartSkeleton } from '@/src/components/charts/ChartSkeleton'

const CommitteeTopologyMap = dynamic(
  () => import('@/src/components/canvas/CommitteeTopologyMap').then((m) => m.CommitteeTopologyMap),
  { ssr: false, loading: () => <ChartSkeleton height={240} /> },
)
import { ShardLegend } from '@/src/components/validators/ShardLegend'
import { ConsolidationDashboard } from '@/src/components/validators/ConsolidationDashboard'
import { useValidatorBalances } from '@/src/hooks/useValidatorBalances'
import { useCommitteeAssignments } from '@/src/hooks/useCommitteeAssignments'
import { StakingCalculator } from '@/src/components/validators/StakingCalculator'

const DEFAULT_VALIDATORS = [100, 101, 102, 103, 104, 105]

/**
 * Validator dashboard. Hosts the "Balance Reconciliation" accordion: a
 * per-validator effective-vs-actual breakdown table, plus projected-unlock
 * cards for any validators currently over the effective-balance cap.
 */
export function ValidatorDashboard({
  validatorIndices = DEFAULT_VALIDATORS,
  beaconNodeUrl,
}: {
  validatorIndices?: number[]
  beaconNodeUrl?: string
}) {
  const [open, setOpen] = useState(true)
  const [queueOpen, setQueueOpen] = useState(true)
  const [topoOpen, setTopoOpen] = useState(true)
  const [consolidationOpen, setConsolidationOpen] = useState(true)
  const { byValidator } = useValidatorBalances(validatorIndices, { beaconNodeUrl })
  const committee = useCommitteeAssignments(validatorIndices, { beaconNodeUrl })

  const cappedValidators = useMemo(
    () => validatorIndices.filter((vi) => byValidator[vi]?.summary.latest?.capped),
    [validatorIndices, byValidator],
  )

  return (
    <div className="space-y-6">
      <StakingCalculator />
      <section className="overflow-hidden rounded-3xl border border-white/10 bg-slate-900/80 text-white">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex w-full items-center justify-between gap-4 p-6 text-left"
          aria-expanded={open}
        >
          <div>
            <h2 className="text-xl font-semibold">Balance Reconciliation</h2>
            <p className="text-sm text-slate-400">
              Effective vs actual balance · {validatorIndices.length} validators
              {cappedValidators.length > 0 && ` · ${cappedValidators.length} capped`}
            </p>
          </div>
          <span className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 text-lg text-slate-300">
            {open ? '−' : '+'}
          </span>
        </button>

        {open && (
          <div className="space-y-6 px-6 pb-6">
            <BalanceReconciliationTable validatorIndices={validatorIndices} beaconNodeUrl={beaconNodeUrl} />

            {cappedValidators.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
                  Projected unlocks
                </h3>
                <div className="grid gap-4 sm:grid-cols-2">
                  {cappedValidators.map((vi) => (
                    <ValidatorUnlockCard key={vi} validatorIndex={vi} beaconNodeUrl={beaconNodeUrl} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      <section className="overflow-hidden rounded-3xl border border-white/10 bg-slate-900/80 text-white">
        <button
          type="button"
          onClick={() => setQueueOpen((o) => !o)}
          className="flex w-full items-center justify-between gap-4 p-6 text-left"
          aria-expanded={queueOpen}
        >
          <div>
            <h2 className="text-xl font-semibold">Exit Queue</h2>
            <p className="text-sm text-slate-400">
              Queue position &amp; projected exit ETA · {validatorIndices.length} validators
            </p>
          </div>
          <span className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 text-lg text-slate-300">
            {queueOpen ? '−' : '+'}
          </span>
        </button>

        {queueOpen && (
          <div className="grid gap-4 px-6 pb-6 sm:grid-cols-2">
            {validatorIndices.map((vi) => (
              <ExitQueuePositionCard key={vi} validatorIndex={vi} beaconNodeUrl={beaconNodeUrl} />
            ))}
          </div>
        )}
      </section>

      <section className="overflow-hidden rounded-3xl border border-white/10 bg-slate-900/80 text-white">
        <button
          type="button"
          onClick={() => setConsolidationOpen((o) => !o)}
          className="flex w-full items-center justify-between gap-4 p-6 text-left"
          aria-expanded={consolidationOpen}
        >
          <div>
            <h2 className="text-xl font-semibold">Consolidation</h2>
            <p className="text-sm text-slate-400">
              EIP-7251 merge recommendations · {validatorIndices.length} validators
            </p>
          </div>
          <span className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 text-lg text-slate-300">
            {consolidationOpen ? '−' : '+'}
          </span>
        </button>

        {consolidationOpen && (
          <ConsolidationDashboard validatorIndices={validatorIndices} byValidator={byValidator} />
        )}
      </section>

      <section className="overflow-hidden rounded-3xl border border-white/10 bg-slate-900/80 text-white">
        <button
          type="button"
          onClick={() => setTopoOpen((o) => !o)}
          className="flex w-full items-center justify-between gap-4 p-6 text-left"
          aria-expanded={topoOpen}
        >
          <div>
            <h2 className="text-xl font-semibold">Shard Committee Topology</h2>
            <p className="text-sm text-slate-400">
              Per-epoch shard assignments · {validatorIndices.length} validators
              {committee.concentration.atRisk && ' · ⚠ concentration risk'}
            </p>
          </div>
          <span className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 text-lg text-slate-300">
            {topoOpen ? '−' : '+'}
          </span>
        </button>

        {topoOpen && (
          <div className="space-y-5 px-6 pb-6">
            <CommitteeTopologyMap
              current={committee.current}
              getValidatorTimeline={committee.getValidatorTimeline}
            />
            <ShardLegend concentration={committee.concentration} />
          </div>
        )}
      </section>
    </div>
  )
}
