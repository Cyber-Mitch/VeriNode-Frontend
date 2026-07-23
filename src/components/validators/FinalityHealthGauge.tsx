'use client'

import type { FinalityHealthSnapshot } from '@/src/utils/compositeScore'

const COLORS: Record<FinalityHealthSnapshot['color'], string> = {
  green: '#22c55e',
  yellow: '#f59e0b',
  red: '#ef4444',
}

export function FinalityHealthGauge({ snapshot }: { snapshot: FinalityHealthSnapshot | null }) {
  const score = snapshot?.score ?? 0
  const circumference = 2 * Math.PI * 46
  const offset = circumference - (score / 100) * circumference
  const color = snapshot ? COLORS[snapshot.color] : '#64748b'

  return (
    <section className="rounded-3xl border border-white/10 bg-slate-900/80 p-6 text-white">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Network Health</h2>
          <p className="text-sm text-slate-400">Beacon finality checkpoint health</p>
        </div>
        <span className="rounded-full px-3 py-1 text-xs font-semibold" style={{ backgroundColor: `${color}22`, color }}>
          {snapshot?.color.toUpperCase() ?? 'LOADING'}
        </span>
      </div>
      <div className="flex flex-col items-center gap-5 sm:flex-row">
        <svg viewBox="0 0 120 120" className="h-36 w-36 -rotate-90">
          <circle cx="60" cy="60" r="46" fill="none" stroke="#1e293b" strokeWidth="12" />
          <circle cx="60" cy="60" r="46" fill="none" stroke={color} strokeWidth="12" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={offset} />
        </svg>
        <div className="w-full space-y-3">
          <div>
            <p className="text-5xl font-bold">{score}</p>
            <p className="text-sm text-slate-400">Composite score / 100</p>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <Metric label="Finalized epoch" value={snapshot?.finalizedEpoch ?? '—'} />
            <Metric label="Justified epoch" value={snapshot?.justifiedEpoch ?? '—'} />
            <Metric label="Participation" value={snapshot ? `${snapshot.participationRate.toFixed(1)}%` : '—'} />
            <Metric label="Stalled slots" value={snapshot?.stalledSlots ?? '—'} />
          </div>
        </div>
      </div>
    </section>
  )
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-white/10 bg-slate-950/60 p-3">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 font-semibold text-slate-100">{value}</p>
    </div>
  )
}
