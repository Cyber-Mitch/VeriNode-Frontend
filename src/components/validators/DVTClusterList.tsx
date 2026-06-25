'use client'

import { useState } from 'react'
import { DVTClusterGauge } from '@/src/components/validators/DVTClusterGauge'
import { useDVTClusterHealth } from '@/src/hooks/useDVTClusterHealth'

const DOT = {
  healthy: 'bg-emerald-400',
  degraded: 'bg-amber-400',
  critical: 'bg-red-400',
}

export function DVTClusterList() {
  const { clusters, isLoading, error, lastUpdated } = useDVTClusterHealth()
  const [expandedClusterId, setExpandedClusterId] = useState<string | null>(null)

  return (
    <section className="rounded-3xl border border-white/10 bg-slate-900/80 p-6 text-white">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">DVT Clusters</h2>
          <p className="text-sm text-slate-400">Quorum, signing participation, and consensus latency health</p>
        </div>
        <p className="text-xs text-slate-500">Auto-refreshes every 30s{lastUpdated ? ` · updated ${new Date(lastUpdated).toLocaleTimeString()}` : ''}</p>
      </div>

      {isLoading && clusters.length === 0 ? <p className="text-sm text-slate-400">Loading DVT cluster health…</p> : null}
      {error ? <p className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{error}</p> : null}
      {!isLoading && clusters.length === 0 && !error ? <p className="text-sm text-slate-400">No DVT clusters returned by the API.</p> : null}

      <div className="space-y-3">
        {clusters.map((cluster) => {
          const isExpanded = expandedClusterId === cluster.id
          return (
            <div key={cluster.id}>
              <button type="button" onClick={() => setExpandedClusterId(isExpanded ? null : cluster.id)} className="flex w-full items-center justify-between gap-3 rounded-2xl border border-white/10 bg-slate-950/60 p-4 text-left transition hover:border-white/20">
                <span className="flex min-w-0 items-center gap-3">
                  <span className={`h-3 w-3 rounded-full ${DOT[cluster.healthTier]}`} />
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{cluster.name}</span>
                    <span className="text-xs text-slate-400">{cluster.participatingNodes}/{cluster.totalNodes} participating · quorum {cluster.quorum}</span>
                  </span>
                </span>
                <span className="text-sm text-slate-400">{isExpanded ? 'Hide' : 'Details'}</span>
              </button>
              {isExpanded ? <div className="mt-3"><DVTClusterGauge cluster={cluster} /></div> : null}
            </div>
          )
        })}
      </div>
    </section>
  )
}
