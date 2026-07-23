'use client'

import { useMemo, useState } from 'react'
import type { DailyReward, RewardSource } from '@/src/types/rewards'

const PAGE_SIZE = 10

const SOURCE_LABELS: Record<RewardSource, string> = {
  proposal: 'Block Proposal',
  attestation: 'Attestation',
  sync: 'Sync Committee',
}

const SOURCE_TONES: Record<RewardSource, string> = {
  proposal: 'text-amber-400',
  attestation: 'text-sky-300',
  sync: 'text-violet-400',
}

interface RewardHistoryTableProps {
  records: DailyReward[]
}

/**
 * Paginated table showing daily reward history: date, total amount, primary
 * source (highest contribution), epoch, and a truncated tx hash for proposals.
 */
export function RewardHistoryTable({ records }: RewardHistoryTableProps) {
  const [page, setPage] = useState(0)

  // Show newest first.
  const sorted = useMemo(() => [...records].reverse(), [records])
  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages - 1)

  const pageRecords = useMemo(
    () => sorted.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE),
    [sorted, safePage],
  )

  function primarySource(r: DailyReward): RewardSource {
    const sources: RewardSource[] = ['proposal', 'attestation', 'sync']
    return sources.reduce((best, src) =>
      r.breakdown[src] > r.breakdown[best] ? src : best,
    )
  }

  if (records.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-slate-400">No reward history available.</p>
    )
  }

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-xl border border-white/10">
        <table className="w-full min-w-[600px] text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-slate-500">
            <tr className="border-b border-white/10">
              <th className="px-4 py-3 font-medium">Date</th>
              <th className="px-4 py-3 font-medium">Amount (ETH)</th>
              <th className="px-4 py-3 font-medium">Source</th>
              <th className="px-4 py-3 font-medium">Epoch</th>
              <th className="px-4 py-3 font-medium">Tx Hash</th>
            </tr>
          </thead>
          <tbody>
            {pageRecords.map((r) => {
              const src = primarySource(r)
              const shortHash = r.txHash
                ? `${r.txHash.slice(0, 6)}…${r.txHash.slice(-4)}`
                : '—'

              return (
                <tr key={r.date} className="border-b border-white/5 text-slate-200">
                  <td className="px-4 py-3 tabular-nums text-slate-300">{r.date}</td>
                  <td className="px-4 py-3 tabular-nums text-emerald-400">
                    +{r.totalEth.toFixed(6)}
                  </td>
                  <td className={`px-4 py-3 ${SOURCE_TONES[src]}`}>{SOURCE_LABELS[src]}</td>
                  <td className="px-4 py-3 tabular-nums text-slate-400">
                    {r.epoch.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-500" title={r.txHash || undefined}>
                    {shortHash}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between text-xs text-slate-400">
        <span>
          {sorted.length} records · page {safePage + 1} of {totalPages}
        </span>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={safePage === 0}
            className="rounded border border-white/10 px-2 py-1 disabled:opacity-30 hover:bg-white/5"
          >
            ‹ Prev
          </button>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={safePage >= totalPages - 1}
            className="rounded border border-white/10 px-2 py-1 disabled:opacity-30 hover:bg-white/5"
          >
            Next ›
          </button>
        </div>
      </div>
    </div>
  )
}
