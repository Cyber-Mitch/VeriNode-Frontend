'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { ValidatorDashboard } from '@/src/components/validators/ValidatorDashboard'

function DashboardRoute() {
  const params = useSearchParams()
  const rawValidators = params.get('validators')
  const validatorIndices = rawValidators
    ? rawValidators
        .split(',')
        .map((v) => Number(v.trim()))
        .filter((n) => Number.isFinite(n) && n >= 0)
    : undefined
  const beaconNodeUrl = params.get('beacon') ?? undefined

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold text-white">Validator Dashboard</h1>
      <ValidatorDashboard
        validatorIndices={validatorIndices && validatorIndices.length > 0 ? validatorIndices : undefined}
        beaconNodeUrl={beaconNodeUrl}
      />
    </main>
  )
}

export default function ValidatorDashboardPage() {
  return (
    <div className="min-h-screen bg-slate-950">
      <Suspense fallback={<div className="p-8 text-slate-400">Loading…</div>}>
        <DashboardRoute />
      </Suspense>
    </div>
  )
}
