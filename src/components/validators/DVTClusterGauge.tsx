'use client'

import type { DVTClusterHealth } from '@/src/hooks/useDVTClusterHealth'

const TIER_STYLES = {
  healthy: { stroke: '#22c55e', bg: 'bg-emerald-500/10', text: 'text-emerald-300', label: 'Healthy' },
  degraded: { stroke: '#f59e0b', bg: 'bg-amber-500/10', text: 'text-amber-300', label: 'Degraded' },
  critical: { stroke: '#ef4444', bg: 'bg-red-500/10', text: 'text-red-300', label: 'Critical' },
}

function formatMs(value: number): string {
  return value >= 1000 ? `${(value / 1000).toFixed(2)}s` : `${Math.round(value)}ms`
}

export function DVTClusterGauge({ cluster }: { cluster: DVTClusterHealth }) {
  const style = TIER_STYLES[cluster.healthTier]
  const circumference = 2 * Math.PI * 46
  const participationRatio = cluster.totalNodes > 0 ? cluster.participatingNodes / cluster.totalNodes : 0
  const quorumRatio = cluster.totalNodes > 0 ? cluster.quorum / cluster.totalNodes : 0
  const dashOffset = circumference - participationRatio * circumference
  const quorumAngle = quorumRatio * 360 - 90
  const quorumX = 60 + 54 * Math.cos((quorumAngle * Math.PI) / 180)
  const quorumY = 60 + 54 * Math.sin((quorumAngle * Math.PI) / 180)

  return (
    <article className="rounded-2xl border border-white/10 bg-slate-950/70 p-4 text-white">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">{cluster.name}</h3>
          <p className="text-xs text-slate-400">{cluster.participatingNodes}/{cluster.totalNodes} nodes participating · quorum {cluster.quorum}</p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${style.bg} ${style.text}`}>{style.label}</span>
      </div>

      <div className="grid gap-4 md:grid-cols-[10rem_1fr]">
        <div className="relative mx-auto h-40 w-40">
          <svg viewBox="0 0 120 120" className="h-40 w-40 -rotate-90">
            <circle cx="60" cy="60" r="46" fill="none" stroke="#1e293b" strokeWidth="12" />
            <circle cx="60" cy="60" r="46" fill="none" stroke={style.stroke} strokeWidth="12" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={dashOffset} className="transition-all duration-500 ease-out" />
            <line x1="60" y1="60" x2={quorumX} y2={quorumY} stroke="#e2e8f0" strokeWidth="2" strokeDasharray="3 3" />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-3xl font-bold">{Math.round(participationRatio * 100)}%</span>
            <span className="text-xs text-slate-400">quorum gauge</span>
          </div>
        </div>

        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2 text-xs">
            <Metric label="p50" value={formatMs(cluster.latencyPercentiles.p50)} />
            <Metric label="p95" value={formatMs(cluster.latencyPercentiles.p95)} />
            <Metric label="p99" value={formatMs(cluster.latencyPercentiles.p99)} />
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {cluster.nodes.map((node) => (
              <div key={node.nodeId} title={`${node.operatorName}: ${(node.participationRate * 100).toFixed(1)}% participation; p50 ${formatMs(node.latencyPercentiles.p50)}, p95 ${formatMs(node.latencyPercentiles.p95)}, p99 ${formatMs(node.latencyPercentiles.p99)}`} className="rounded-xl border border-white/10 bg-slate-900/70 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium">{node.operatorName}</span>
                  <span className={`h-2.5 w-2.5 rounded-full ${node.isParticipating ? 'bg-emerald-400' : 'bg-red-400'}`} />
                </div>
                <p className="mt-1 text-xs text-slate-400">{(node.participationRate * 100).toFixed(1)}% signing participation</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </article>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-slate-900 p-2 text-center">
      <p className="uppercase tracking-wide text-slate-500">{label}</p>
      <p className="font-semibold text-slate-100">{value}</p>
    </div>
  )
}
