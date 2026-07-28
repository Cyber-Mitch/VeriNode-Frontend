'use client'

import {
  DEFAULT_REPLICATION_POLICY,
  createFailoverPlan,
  evaluateReplicationHealth,
  runDisasterRecoveryDrill,
} from '@/services/disasterRecoveryService'
import type { ReplicationRegion } from '@/types/disasterRecovery'

const DEMO_REGIONS: ReplicationRegion[] = [
  {
    id: 'us-east-1',
    displayName: 'US East',
    role: 'primary',
    status: 'healthy',
    p99LatencyMs: 72,
    replicationLagMs: 118,
    lastHeartbeatAt: Date.now() - 4_000,
    dataResidency: 'US',
  },
  {
    id: 'eu-west-1',
    displayName: 'EU West',
    role: 'secondary',
    status: 'healthy',
    p99LatencyMs: 88,
    replicationLagMs: 135,
    lastHeartbeatAt: Date.now() - 5_000,
    dataResidency: 'EU',
  },
  {
    id: 'ap-southeast-1',
    displayName: 'AP Southeast',
    role: 'observer',
    status: 'degraded',
    p99LatencyMs: 122,
    replicationLagMs: 410,
    lastHeartbeatAt: Date.now() - 12_000,
    dataResidency: 'APAC',
  },
]

const statusClass = {
  pass: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  warn: 'border-amber-200 bg-amber-50 text-amber-800',
  fail: 'border-red-200 bg-red-50 text-red-800',
}

export function DisasterRecoveryDashboard({ regions = DEMO_REGIONS }: { regions?: ReplicationRegion[] }) {
  const health = evaluateReplicationHealth(regions, DEFAULT_REPLICATION_POLICY)
  const plan = createFailoverPlan(regions, DEFAULT_REPLICATION_POLICY)
  const drill = runDisasterRecoveryDrill(regions, DEFAULT_REPLICATION_POLICY, 18_000, 0.04)

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-6 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-blue-600">Disaster recovery</p>
          <h2 className="text-2xl font-bold text-slate-950">Multi-region replication readiness</h2>
          <p className="mt-2 max-w-3xl text-sm text-slate-600">
            Tracks P99 latency, replication lag, heartbeat freshness, failover plan, and blue-green canary readiness
            against the 99.99% availability target.
          </p>
        </div>
        <div className={`rounded-full border px-4 py-2 text-sm font-semibold ${statusClass[drill.status]}`}>
          Drill status: {drill.status.toUpperCase()}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Metric label="P99 target" value={`< ${DEFAULT_REPLICATION_POLICY.criticalPathP99TargetMs}ms`} />
        <Metric label="RPO guardrail" value={`${DEFAULT_REPLICATION_POLICY.maxReplicationLagMs}ms`} />
        <Metric label="Availability target" value={`${DEFAULT_REPLICATION_POLICY.availabilityTarget}%`} />
      </div>

      <div className="mt-6 overflow-hidden rounded-xl border border-slate-200">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-slate-600">
            <tr>
              <th className="px-4 py-3 font-semibold">Region</th>
              <th className="px-4 py-3 font-semibold">Role</th>
              <th className="px-4 py-3 font-semibold">P99 latency</th>
              <th className="px-4 py-3 font-semibold">Replication lag</th>
              <th className="px-4 py-3 font-semibold">Health</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {regions.map((region) => {
              const item = health.find((entry) => entry.regionId === region.id)
              return (
                <tr key={region.id} className="text-slate-700">
                  <td className="px-4 py-3 font-medium text-slate-950">{region.displayName}</td>
                  <td className="px-4 py-3 capitalize">{region.role}</td>
                  <td className="px-4 py-3">{region.p99LatencyMs}ms</td>
                  <td className="px-4 py-3">{region.replicationLagMs}ms</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusClass[item?.status ?? 'warn']}`}>
                      {(item?.status ?? 'warn').toUpperCase()}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 p-4">
          <h3 className="font-semibold text-slate-950">Failover decision</h3>
          <p className="mt-2 text-sm text-slate-600">{plan.reason}</p>
          <p className="mt-3 text-sm font-semibold text-slate-800">Decision: {plan.decision}</p>
        </div>
        <div className="rounded-xl border border-slate-200 p-4">
          <h3 className="font-semibold text-slate-950">Canary analysis</h3>
          <p className="mt-2 text-sm text-slate-600">
            RPO {drill.rpoMs}ms, RTO {drill.rtoMs}ms, availability sample {drill.availabilityPercent.toFixed(2)}%.
          </p>
          <p className="mt-3 text-sm font-semibold text-slate-800">
            Canary: {drill.canaryPassed ? 'within error budget' : 'blocked'}
          </p>
        </div>
      </div>
    </section>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-slate-950">{value}</p>
    </div>
  )
}
