'use client'

import { useState } from 'react'
import { useStakingCalculator } from '@/src/hooks/useStakingCalculator'

const DEFAULT_PRINCIPAL_GWEI = (BigInt(32) * BigInt(1_000_000_000)).toString()

export function StakingCalculator() {
  const [principal, setPrincipal] = useState(DEFAULT_PRINCIPAL_GWEI)
  const [rate, setRate] = useState(3.5)
  const [periods, setPeriods] = useState(12)
  const [unit, setUnit] = useState<'eth' | 'gwei'>('eth')
  const calculation = useStakingCalculator({ principalGwei: principal || '0', annualRatePct: rate, compoundingPeriods: periods })

  return (
    <section className="rounded-3xl border border-white/10 bg-slate-900/80 p-6 text-white">
      <div className="mb-5 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">Staking Calculator</h2>
          <p className="text-sm text-slate-400">Precision-safe BigInt calculations in gwei.</p>
        </div>
        <button type="button" onClick={() => setUnit((current) => current === 'eth' ? 'gwei' : 'eth')} className="rounded-full border border-white/10 px-4 py-2 text-sm text-slate-200">
          Show {unit === 'eth' ? 'gwei' : 'ETH'}
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <label className="text-sm text-slate-300">Principal (gwei)
          <input className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-white" value={principal} onChange={(event) => setPrincipal(event.target.value)} inputMode="numeric" />
        </label>
        <label className="text-sm text-slate-300">Annual rate (%)
          <input className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-white" value={rate} onChange={(event) => setRate(Number(event.target.value))} type="number" step="0.01" />
        </label>
        <label className="text-sm text-slate-300">Compounding periods
          <input className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-white" value={periods} onChange={(event) => setPeriods(Number(event.target.value))} type="number" min="0" step="1" />
        </label>
      </div>

      <dl className="mt-6 grid gap-4 md:grid-cols-3">
        <Stat label="Annual reward" value={calculation.format(calculation.annualRewardGwei, unit)} />
        <Stat label="Compounded reward" value={calculation.format(calculation.compoundedRewardGwei, unit)} />
        <Stat label="Projected balance" value={calculation.format(calculation.projectedGwei, unit)} />
      </dl>
    </section>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl bg-slate-950/80 p-4"><dt className="text-xs uppercase tracking-wide text-slate-500">{label}</dt><dd className="mt-2 font-mono text-lg text-emerald-300">{value}</dd></div>
}
