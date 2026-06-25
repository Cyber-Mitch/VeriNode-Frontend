'use client'

import { CONCENTRATION_THRESHOLD, type ConcentrationResult } from '@/src/types/committee'
import { shardColor } from '@/src/utils/shardColorMapping'

/**
 * Legend mapping shard index → color for the shards an operator currently
 * occupies, with per-shard share and a concentration-risk highlight on any
 * shard exceeding the threshold.
 */
export function ShardLegend({ concentration }: { concentration: ConcentrationResult }) {
  if (concentration.total === 0) {
    return <p className="text-sm text-slate-400">No shard assignments for this epoch.</p>
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-wide text-slate-500">
          Shard distribution ({concentration.perShard.length} shards)
        </p>
        {concentration.atRisk ? (
          <span className="rounded-full bg-red-500/15 px-2.5 py-1 text-[10px] font-semibold text-red-400">
            ⚠ CONCENTRATION RISK · {(concentration.maxShare * 100).toFixed(0)}% on shard{' '}
            {concentration.topShard}
          </span>
        ) : (
          <span className="rounded-full bg-emerald-500/15 px-2.5 py-1 text-[10px] font-semibold text-emerald-400">
            WELL DISTRIBUTED · max {(concentration.maxShare * 100).toFixed(0)}%
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {concentration.perShard.map(({ shard, count, share }) => {
          const risky = share > CONCENTRATION_THRESHOLD
          return (
            <div
              key={shard}
              className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs ${
                risky ? 'border-red-500/40 bg-red-500/5' : 'border-white/10 bg-slate-950/40'
              }`}
            >
              <span
                className="inline-block h-3 w-3 shrink-0 rounded-sm"
                style={{ backgroundColor: shardColor(shard) }}
              />
              <span className="font-mono text-slate-200">S{shard}</span>
              <span className="ml-auto text-slate-400">
                {count} · {(share * 100).toFixed(0)}%
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
