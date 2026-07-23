'use client'

import { useMemo, useState } from 'react'
import type { ApyCalculatorInput, ApyProjection } from '@/src/types/rewards'

// ---------------------------------------------------------------------------
// APY calculation
// ---------------------------------------------------------------------------

/**
 * Simplified beacon-chain APY model:
 *   base_reward_per_validator_per_year ≈
 *     (total_issuance / active_validators) × participation_adjustment
 *
 * We use a known mainnet constant: at 900,000 active validators with 100%
 * participation, network APY ≈ 3.8%. We scale linearly with participation
 * and inversely with √(active_validators) to model the dilution effect.
 */
function computeProjection(input: ApyCalculatorInput): ApyProjection {
  const { stakeAmount, activeValidators, participationRate } = input

  // Clamp inputs to valid ranges.
  const stake = Math.max(1, Math.min(100_000, stakeAmount))
  const validators = Math.max(100, Math.min(10_000, activeValidators))
  const participation = Math.max(50, Math.min(100, participationRate)) / 100

  // Reference: 900k validators, 100% participation → 3.8% APY.
  const REF_VALIDATORS = 900_000
  const REF_APY = 3.8

  // APY scales with √(ref_validators / active_validators) and participation.
  const apyPct = REF_APY * Math.sqrt(REF_VALIDATORS / validators) * participation

  const yearlyRewardEth = (stake * apyPct) / 100
  const monthlyRewardEth = yearlyRewardEth / 12
  const dailyRewardEth = yearlyRewardEth / 365

  return {
    dailyRewardEth: parseFloat(dailyRewardEth.toFixed(6)),
    monthlyRewardEth: parseFloat(monthlyRewardEth.toFixed(4)),
    yearlyRewardEth: parseFloat(yearlyRewardEth.toFixed(4)),
    projectedApyPct: parseFloat(apyPct.toFixed(2)),
  }
}

// ---------------------------------------------------------------------------
// Range slider
// ---------------------------------------------------------------------------

interface SliderProps {
  label: string
  value: number
  min: number
  max: number
  step: number
  format: (v: number) => string
  onChange: (v: number) => void
}

function Slider({ label, value, min, max, step, format, onChange }: SliderProps) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-slate-400">{label}</span>
        <span className="font-semibold text-white">{format(value)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-slate-700 accent-sky-400"
        aria-label={label}
      />
      <div className="flex justify-between text-[10px] text-slate-600">
        <span>{format(min)}</span>
        <span>{format(max)}</span>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

/**
 * APY Calculator: sliders for stake amount, active validator count, and
 * network participation rate. Computes projected daily/monthly/yearly rewards
 * and APY with a projection disclaimer.
 */
export function ApyCalculator() {
  const [input, setInput] = useState<ApyCalculatorInput>({
    stakeAmount: 32,
    activeValidators: 900,
    participationRate: 95,
  })

  const projection = useMemo<ApyProjection>(() => computeProjection(input), [input])

  function update<K extends keyof ApyCalculatorInput>(key: K, value: ApyCalculatorInput[K]) {
    setInput((prev) => ({ ...prev, [key]: value }))
  }

  return (
    <div className="space-y-5">
      {/* Sliders */}
      <div className="space-y-4">
        <Slider
          label="Stake amount (tokens)"
          value={input.stakeAmount}
          min={1}
          max={100_000}
          step={1}
          format={(v) => v.toLocaleString()}
          onChange={(v) => update('stakeAmount', v)}
        />
        <Slider
          label="Active validators (×100)"
          value={input.activeValidators}
          min={100}
          max={10_000}
          step={100}
          format={(v) => `${(v / 100).toFixed(0)}k`}
          onChange={(v) => update('activeValidators', v)}
        />
        <Slider
          label="Participation rate (%)"
          value={input.participationRate}
          min={50}
          max={100}
          step={1}
          format={(v) => `${v}%`}
          onChange={(v) => update('participationRate', v)}
        />
      </div>

      {/* Projected results */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <ProjectionStat label="Daily" value={`${projection.dailyRewardEth.toFixed(6)}`} unit="ETH" />
        <ProjectionStat label="Monthly" value={`${projection.monthlyRewardEth.toFixed(4)}`} unit="ETH" />
        <ProjectionStat label="Yearly" value={`${projection.yearlyRewardEth.toFixed(4)}`} unit="ETH" />
        <ProjectionStat
          label="Projected APY"
          value={`${projection.projectedApyPct.toFixed(2)}%`}
          tone="text-sky-300"
        />
      </div>

      {/* Disclaimer */}
      <p className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-400/80">
        ⚠ Past performance does not guarantee future results. Projections are estimates based on
        simplified network models and may differ significantly from actual rewards.
      </p>
    </div>
  )
}

function ProjectionStat({
  label,
  value,
  unit,
  tone = 'text-emerald-400',
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
