'use client'

// Tabular summary of all DBSCAN clusters with risk scores, node counts,
// and top mitigation recommendations.

import type { ClusterRiskResult } from '@/src/store/riskSlice'
import type { RiskTier } from '@/src/utils/riskScore'

const TIER_STYLES: Record<RiskTier, { bg: string; text: string; label: string }> = {
  low: { bg: 'bg-emerald-500/10', text: 'text-emerald-300', label: 'Low' },
  medium: { bg: 'bg-amber-500/10', text: 'text-amber-300', label: 'Medium' },
  high: { bg: 'bg-orange-500/10', text: 'text-orange-300', label: 'High' },
  critical: { bg: 'bg-red-500/10', text: 'text-red-300', label: 'Critical' },
}

interface RiskSummaryPanelProps {
  clusters: ClusterRiskResult[]
  /** Cluster ID currently selected on the map (highlights the row). */
  selectedClusterId?: number | null
  onSelectCluster?: (clusterId: number) => void
}

/**
 * Tabular overview of detected geographic risk clusters. Each row shows the
 * cluster ID, node count, weighted risk score, tier badge, shared-infra
 * breakdown, and the top mitigation recommendation.
 */
export function RiskSummaryPanel({
  clusters,
  selectedClusterId,
  onSelectCluster,
}: RiskSummaryPanelProps) {
  if (clusters.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-slate-400">
        No clusters detected. Ensure nodes have valid coordinates.
      </p>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm text-slate-200">
        <thead>
          <tr className="border-b border-white/10 text-xs uppercase tracking-wide text-slate-500">
            <th className="pb-2 pr-4 text-left">Cluster</th>
            <th className="pb-2 pr-4 text-right">Nodes</th>
            <th className="pb-2 pr-4 text-right">Score</th>
            <th className="pb-2 pr-4 text-left">Tier</th>
            <th className="pb-2 pr-4 text-right">Shared IPs</th>
            <th className="pb-2 pr-4 text-right">Shared ASNs</th>
            <th className="pb-2 pr-4 text-right">Shared Regions</th>
            <th className="pb-2 text-left">Top Mitigation</th>
          </tr>
        </thead>
        <tbody>
          {clusters.map((cluster) => {
            const style = TIER_STYLES[cluster.tier]
            const isSelected = cluster.clusterId === selectedClusterId
            const topRec = cluster.recommendations[0]

            return (
              <tr
                key={cluster.clusterId}
                onClick={() => onSelectCluster?.(cluster.clusterId)}
                className={`cursor-pointer border-b border-white/5 transition-colors hover:bg-white/5 ${
                  isSelected ? 'bg-sky-500/10' : ''
                }`}
              >
                <td className="py-3 pr-4 font-mono text-sky-300">#{cluster.clusterId}</td>
                <td className="py-3 pr-4 text-right">{cluster.nodeCount}</td>
                <td className="py-3 pr-4 text-right font-semibold">
                  {(cluster.riskScore * 100).toFixed(1)}%
                </td>
                <td className="py-3 pr-4">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold ${style.bg} ${style.text}`}
                  >
                    {style.label}
                  </span>
                </td>
                <td className="py-3 pr-4 text-right text-slate-300">
                  {cluster.sharedIpCount} / {cluster.nodeCount}
                </td>
                <td className="py-3 pr-4 text-right text-slate-300">
                  {cluster.sharedAsnCount} / {cluster.nodeCount}
                </td>
                <td className="py-3 pr-4 text-right text-slate-300">
                  {cluster.sharedCloudRegionCount} / {cluster.nodeCount}
                </td>
                <td className="py-3 max-w-xs">
                  {topRec ? (
                    <span className="text-slate-400" title={topRec.detail}>
                      {topRec.title}{' '}
                      <span className="text-slate-500">({topRec.sharedValue})</span>
                    </span>
                  ) : (
                    <span className="text-slate-600">—</span>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
