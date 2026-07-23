'use client'

import { useCallback } from 'react'
import type { DailyReward } from '@/src/types/rewards'

interface ExportButtonProps {
  records: DailyReward[]
  pubkey: string
}

/**
 * Triggers a CSV download of the full reward history.
 * Columns: date, epoch, total_eth, proposal_eth, attestation_eth, sync_eth,
 *          block_number, tx_hash.
 */
export function ExportButton({ records, pubkey }: ExportButtonProps) {
  const handleExport = useCallback(() => {
    if (records.length === 0) return

    const header = [
      'date',
      'epoch',
      'total_eth',
      'proposal_eth',
      'attestation_eth',
      'sync_eth',
      'block_number',
      'tx_hash',
    ].join(',')

    const rows = records.map((r) =>
      [
        r.date,
        r.epoch,
        r.totalEth,
        r.breakdown.proposal,
        r.breakdown.attestation,
        r.breakdown.sync,
        r.blockNumber,
        r.txHash,
      ].join(','),
    )

    const csv = [header, ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)

    const link = document.createElement('a')
    link.href = url
    link.download = `rewards-${pubkey.slice(0, 10)}-${new Date().toISOString().slice(0, 10)}.csv`
    link.style.display = 'none'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }, [records, pubkey])

  return (
    <button
      type="button"
      onClick={handleExport}
      disabled={records.length === 0}
      className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-slate-800/60 px-3 py-1.5 text-xs font-medium text-slate-200 transition-colors hover:bg-slate-700/60 disabled:cursor-not-allowed disabled:opacity-40"
      aria-label="Export reward history as CSV"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 16 16"
        fill="currentColor"
        className="h-3.5 w-3.5"
        aria-hidden="true"
      >
        <path d="M8 1a.75.75 0 0 1 .75.75v5.793l1.72-1.72a.75.75 0 1 1 1.06 1.06L8 10.41 4.47 6.883a.75.75 0 0 1 1.06-1.06l1.72 1.72V1.75A.75.75 0 0 1 8 1ZM2 11.75a.75.75 0 0 1 1.5 0v.75h9v-.75a.75.75 0 0 1 1.5 0v1.5A.75.75 0 0 1 13.5 15h-11A.75.75 0 0 1 2 13.25v-1.5Z" />
      </svg>
      Export CSV
    </button>
  )
}
