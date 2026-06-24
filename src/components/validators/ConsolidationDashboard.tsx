'use client'

import { useMemo, useState } from 'react'
import type { ValidatorReconciliation } from '@/src/hooks/useValidatorBalances'
import { useConsolidationEligibility } from '@/src/hooks/useConsolidationEligibility'
import { sortConsolidationRecommendations, type ConsolidationSortKey } from '@/src/utils/consolidationEligibility'

interface ConsolidationDashboardProps {
  validatorIndices: number[]
  byValidator: Record<number, ValidatorReconciliation>
}

const sortLabels: Record<ConsolidationSortKey, string> = {
  savings: 'Potential savings',
  validator_count: 'Validator count',
  readiness_score: 'Readiness score',
}

export function ConsolidationDashboard({ validatorIndices, byValidator }: ConsolidationDashboardProps) {
  const [sortBy, setSortBy] = useState<ConsolidationSortKey>('savings')
  const { recommendations, processed, total, isLoading, error } = useConsolidationEligibility(validatorIndices, byValidator)
  const sorted = useMemo(() => sortConsolidationRecommendations(recommendations, sortBy), [recommendations, sortBy])

  return (
    <div className="space-y-4 px-6 pb-6">
      <div className="flex flex-col justify-between gap-3 rounded-2xl border border-sky-400/20 bg-sky-400/10 p-4 sm:flex-row sm:items-center">
        <div>
          <h3 className="font-semibold text-sky-100">EIP-7251 consolidation eligibility</h3>
          <p className="text-sm text-slate-300">
            Scans up to 10,000 validators in 500-validator worker chunks and groups validators that share withdrawal credentials.
          </p>
        </div>
        <label className="text-sm text-slate-300">
          Sort by{' '}
          <select
            value={sortBy}
            onChange={(event) => setSortBy(event.target.value as ConsolidationSortKey)}
            className="rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-white"
          >
            {Object.entries(sortLabels).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>
      </div>

      {isLoading && <p className="text-sm text-slate-400">Scanning validators… {processed.toLocaleString()} / {total.toLocaleString()}</p>}
      {error && <p className="text-sm text-red-300">{error}</p>}

      <div className="overflow-x-auto rounded-2xl border border-white/10">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="bg-white/5 text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-4 py-3">Group ID</th>
              <th className="px-4 py-3">Current count</th>
              <th className="px-4 py-3">Merged count</th>
              <th className="px-4 py-3">Potential gas savings/year</th>
              <th className="px-4 py-3">Readiness score</th>
              <th className="px-4 py-3">Total effective ETH</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {sorted.map((group) => (
              <tr key={group.groupId} className="text-slate-200">
                <td className="px-4 py-3 font-mono text-sky-300">{group.groupId}</td>
                <td className="px-4 py-3 tabular-nums">{group.currentCount.toLocaleString()}</td>
                <td className="px-4 py-3 tabular-nums">{group.mergedCount.toLocaleString()}</td>
                <td className="px-4 py-3 tabular-nums text-emerald-300">{group.estimatedAnnualGasSavings.toLocaleString()} gas</td>
                <td className="px-4 py-3 tabular-nums">{(group.readinessScore * 100).toFixed(1)}%</td>
                <td className="px-4 py-3 tabular-nums">{group.totalEffectiveBalanceEth.toFixed(2)}</td>
              </tr>
            ))}
            {!isLoading && sorted.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                  No consolidation-eligible groups found for this validator set.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
