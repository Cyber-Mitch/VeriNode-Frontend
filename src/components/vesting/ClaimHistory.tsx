'use client';

/**
 * ClaimHistory
 *
 * Paginated table of past claim events with:
 *  - Date, schedule label, token amount, USD value at claim, tx hash
 *  - Pagination controls (10 rows/page)
 *  - CSV export for tax reporting
 *
 * CSV columns: date, schedule, amount, token_symbol, usd_value_at_claim, tx_hash
 */

import { useMemo, useState, useCallback } from 'react';
import type { ClaimRecord } from '@/src/types/vesting';

const PAGE_SIZE = 10;

interface ClaimHistoryProps {
  records: ClaimRecord[];
  /** Wallet address used in the exported filename. */
  address: string;
}

// ── formatting helpers ────────────────────────────────────────────────────────

function formatAmount(n: number, symbol: string): string {
  return `${n.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${symbol}`;
}

function formatUsd(n: number | null): string {
  if (n == null) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(n);
}

function shortHash(hash: string): string {
  if (hash.length < 12) return hash;
  return `${hash.slice(0, 8)}…${hash.slice(-6)}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ── CSV export ────────────────────────────────────────────────────────────────

function exportCsv(records: ClaimRecord[], address: string): void {
  const header = ['date', 'schedule', 'amount', 'token_symbol', 'usd_value_at_claim', 'tx_hash'].join(',');

  const rows = records.map((r) =>
    [
      `"${r.date}"`,
      `"${r.scheduleLabel}"`,
      r.amount,
      r.tokenSymbol,
      r.usdValueAtClaim ?? '',
      `"${r.txHash}"`,
    ].join(','),
  );

  const csv = [header, ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = `vesting-claims-${address.slice(0, 10)}-${new Date().toISOString().slice(0, 10)}.csv`;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// ── main export ───────────────────────────────────────────────────────────────

export function ClaimHistory({ records, address }: ClaimHistoryProps) {
  const [page, setPage] = useState(0);

  // Newest first
  const sorted = useMemo(() => [...records].sort((a, b) => b.date.localeCompare(a.date)), [records]);
  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);

  const pageRecords = useMemo(
    () => sorted.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE),
    [sorted, safePage],
  );

  const handleExport = useCallback(() => exportCsv(records, address), [records, address]);

  if (records.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-slate-400">No claim history found.</p>
    );
  }

  return (
    <div className="space-y-3">
      {/* Export button */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleExport}
          className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-slate-800/60 px-3 py-1.5 text-xs font-medium text-slate-200 transition-colors hover:bg-slate-700/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400"
          aria-label="Export claim history as CSV"
        >
          {/* download icon */}
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
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-white/10">
        <table className="w-full min-w-[680px] text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-slate-500 border-b border-white/10">
            <tr>
              <th className="px-4 py-3 font-medium">Date</th>
              <th className="px-4 py-3 font-medium">Schedule</th>
              <th className="px-4 py-3 font-medium">Amount</th>
              <th className="px-4 py-3 font-medium">USD at Claim</th>
              <th className="px-4 py-3 font-medium">Tx Hash</th>
            </tr>
          </thead>
          <tbody>
            {pageRecords.map((r) => (
              <tr key={r.id} className="border-b border-white/5 text-slate-200">
                <td className="px-4 py-3 tabular-nums text-slate-400 text-xs whitespace-nowrap">
                  {formatDate(r.date)}
                </td>
                <td className="px-4 py-3 text-slate-300">{r.scheduleLabel}</td>
                <td className="px-4 py-3 tabular-nums text-emerald-400 font-medium">
                  +{formatAmount(r.amount, r.tokenSymbol)}
                </td>
                <td className="px-4 py-3 tabular-nums text-slate-400">
                  {formatUsd(r.usdValueAtClaim)}
                </td>
                <td
                  className="px-4 py-3 font-mono text-xs text-slate-500"
                  title={r.txHash}
                >
                  {shortHash(r.txHash)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between text-xs text-slate-400">
        <span>
          {sorted.length} claim{sorted.length !== 1 ? 's' : ''} · page {safePage + 1} of {totalPages}
        </span>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={safePage === 0}
            className="rounded border border-white/10 px-2 py-1 disabled:opacity-30 hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400"
            aria-label="Previous page"
          >
            ‹ Prev
          </button>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={safePage >= totalPages - 1}
            className="rounded border border-white/10 px-2 py-1 disabled:opacity-30 hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400"
            aria-label="Next page"
          >
            Next ›
          </button>
        </div>
      </div>
    </div>
  );
}
