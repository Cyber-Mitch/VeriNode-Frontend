'use client'

import { useMemo } from 'react'
import { formatEth } from '@/src/utils/balanceMath'
import {
  useValidatorBalances,
  type ValidatorReconciliation,
} from '@/src/hooks/useValidatorBalances'

const ZERO = BigInt(0)

/** Stacked proportion bar of rewards / penalties / withdrawals for a validator. */
function DeltaBar({ entry }: { entry: ValidatorReconciliation }) {
  const { totalRewardsGwei, totalPenaltiesGwei, totalWithdrawalsGwei } = entry.summary
  const total = totalRewardsGwei + totalPenaltiesGwei + totalWithdrawalsGwei
  const pct = (v: bigint) => (total > ZERO ? (Number(v) / Number(total)) * 100 : 0)

  return (
    <div className="flex h-2 w-28 overflow-hidden rounded-full bg-slate-800" title="rewards / penalties / withdrawals">
      <span style={{ width: `${pct(totalRewardsGwei)}%` }} className="bg-emerald-500" />
      <span style={{ width: `${pct(totalPenaltiesGwei)}%` }} className="bg-red-500" />
      <span style={{ width: `${pct(totalWithdrawalsGwei)}%` }} className="bg-sky-500" />
    </div>
  )
}

/**
 * Per-validator effective-vs-actual balance breakdown. Each row shows the
 * actual and effective balance, capped status, and the decomposed
 * reward/penalty/withdrawal totals with a proportion bar.
 */
export function BalanceReconciliationTable({
  validatorIndices,
  beaconNodeUrl,
}: {
  validatorIndices: number[]
  beaconNodeUrl?: string
}) {
  const { byValidator, validators, isLoading, error } = useValidatorBalances(validatorIndices, {
    beaconNodeUrl,
  })

  const rows = useMemo(
    () => validators.map((vi) => ({ vi, entry: byValidator[vi] })).filter((r) => r.entry),
    [validators, byValidator],
  )

  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/40">
      {error && <p className="px-4 py-3 text-sm text-red-400">{error}</p>}
      {isLoading && rows.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-slate-400">Reconciling balances…</p>
      ) : rows.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-slate-400">No validators to reconcile.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-slate-500">
              <tr className="border-b border-white/10">
                <th className="px-4 py-3 font-medium">Validator</th>
                <th className="px-4 py-3 font-medium">Actual</th>
                <th className="px-4 py-3 font-medium">Effective</th>
                <th className="px-4 py-3 font-medium">Rewards</th>
                <th className="px-4 py-3 font-medium">Penalties</th>
                <th className="px-4 py-3 font-medium">Withdrawals</th>
                <th className="px-4 py-3 font-medium">Mix</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ vi, entry }) => {
                const s = entry.summary
                const latest = s.latest
                return (
                  <tr key={vi} className="border-b border-white/5 text-slate-200">
                    <td className="px-4 py-3 font-mono">
                      #{vi}
                      {latest?.capped && (
                        <span className="ml-2 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-400">
                          CAPPED
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      {latest ? formatEth(latest.actualBalanceGwei) : '—'}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-slate-400">
                      {latest ? formatEth(latest.effectiveBalanceGwei) : '—'}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-emerald-400">
                      +{formatEth(s.totalRewardsGwei)}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-red-400">
                      -{formatEth(s.totalPenaltiesGwei)}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-sky-400">
                      {formatEth(s.totalWithdrawalsGwei)}
                    </td>
                    <td className="px-4 py-3">
                      <DeltaBar entry={entry} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
