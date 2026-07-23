'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { format } from 'date-fns'
import { useBridgeTx } from '@/src/hooks/useBridgeTx'
import { BRIDGE_CHAINS, BRIDGE_TX_STATUS, type BridgeChain, type BridgeTxStatus } from '@/src/types/bridge'
import { bridgeChainName } from '@/src/config/bridgeChains'
import { bridgeStatusLabel } from '@/src/utils/bridgeFormat'
import { BridgeStatusStepper } from '@/src/components/bridge/BridgeStatusStepper'
import { EstimatedCompletion } from '@/src/components/bridge/EstimatedCompletion'
import { BridgeNotificationToggle } from '@/src/components/bridge/BridgeNotificationToggle'

const PAGE_SIZE = 20

function parseChain(value: string | null): BridgeChain | undefined {
  return (BRIDGE_CHAINS as readonly string[]).includes(value ?? '') ? (value as BridgeChain) : undefined
}

function parseStatus(value: string | null): BridgeTxStatus | undefined {
  return (BRIDGE_TX_STATUS as readonly string[]).includes(value ?? '') ? (value as BridgeTxStatus) : undefined
}

function parsePage(value: string | null): number {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1
}

function SkeletonRow() {
  return (
    <tr className="border-b border-white/5">
      {Array.from({ length: 6 }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className="h-4 w-full animate-pulse rounded bg-slate-800" />
        </td>
      ))}
    </tr>
  )
}

/**
 * Cross-chain bridge transaction table: filters (chain/status/date range) and
 * pagination are both server-side, driven entirely by URL search params so the
 * view is shareable/bookmarkable and survives a refresh. Rows are keyed by
 * transaction id and rendered in the order the API returns them (assumed
 * newest-first) so a background poll patches values in place instead of
 * remounting or reordering rows.
 */
export function BridgeTransactionList() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const chain = parseChain(searchParams.get('chain'))
  const status = parseStatus(searchParams.get('status'))
  const dateFrom = searchParams.get('dateFrom') ?? undefined
  const dateTo = searchParams.get('dateTo') ?? undefined
  const page = parsePage(searchParams.get('page'))

  const hasActiveFilter = Boolean(chain || status || dateFrom || dateTo)

  const { transactions, total, isLoading, isFetching, isError, error, hasActive } = useBridgeTx({
    chain,
    status,
    dateFrom,
    dateTo,
    page,
    pageSize: PAGE_SIZE,
  })

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  // Date.now() is a read of an external system (the wall clock), which is
  // exactly what effects are for - calling it during render is disallowed
  // (it's impure), so `now` only advances inside this effect, and only when
  // a poll actually brings in a new transactions array (not on every render).
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing from an external source (the clock), not deriving from props/state
    setNow(Date.now())
  }, [transactions])

  function updateParams(updates: Record<string, string | undefined>, resetPage: boolean) {
    const next = new URLSearchParams(searchParams.toString())
    for (const [key, value] of Object.entries(updates)) {
      if (value) next.set(key, value)
      else next.delete(key)
    }
    if (resetPage) next.delete('page')
    router.replace(`${pathname}?${next.toString()}`, { scroll: false })
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/40 text-white">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-white/10 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs text-slate-400">
            Chain
            <select
              value={chain ?? ''}
              onChange={(e) => updateParams({ chain: e.target.value || undefined }, true)}
              className="rounded-lg border border-white/10 bg-slate-900 px-2 py-1.5 text-sm text-white"
            >
              <option value="">All chains</option>
              {BRIDGE_CHAINS.map((c) => (
                <option key={c} value={c}>
                  {bridgeChainName(c)}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-xs text-slate-400">
            Status
            <select
              value={status ?? ''}
              onChange={(e) => updateParams({ status: e.target.value || undefined }, true)}
              className="rounded-lg border border-white/10 bg-slate-900 px-2 py-1.5 text-sm text-white"
            >
              <option value="">All statuses</option>
              {BRIDGE_TX_STATUS.map((s) => (
                <option key={s} value={s}>
                  {bridgeStatusLabel(s)}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-xs text-slate-400">
            From
            <input
              type="date"
              value={dateFrom ?? ''}
              onChange={(e) => updateParams({ dateFrom: e.target.value || undefined }, true)}
              className="rounded-lg border border-white/10 bg-slate-900 px-2 py-1.5 text-sm text-white"
            />
          </label>

          <label className="flex flex-col gap-1 text-xs text-slate-400">
            To
            <input
              type="date"
              value={dateTo ?? ''}
              onChange={(e) => updateParams({ dateTo: e.target.value || undefined }, true)}
              className="rounded-lg border border-white/10 bg-slate-900 px-2 py-1.5 text-sm text-white"
            />
          </label>
        </div>

        <div className="flex items-center gap-3 text-xs text-slate-400">
          <BridgeNotificationToggle transactions={transactions} />
          {isFetching && !isLoading && (
            <span role="status" aria-live="polite">
              Updating…
            </span>
          )}
          {hasActive && !isFetching && <span>Live</span>}
        </div>
      </div>

      {isError && (
        <p role="alert" className="px-4 py-3 text-sm text-red-400">
          {error?.message ?? 'Failed to load bridge transactions.'}
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[880px] text-left text-sm">
          <caption className="sr-only">Cross-chain bridge transactions</caption>
          <thead className="text-xs uppercase tracking-wide text-slate-500">
            <tr className="border-b border-white/10">
              <th scope="col" className="px-4 py-3 font-medium">
                Route
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Amount
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Status
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Est. Completion
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Initiated
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                <span className="sr-only">Details</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {isLoading &&
              transactions.length === 0 &&
              Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)}

            {!isLoading && transactions.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-sm text-slate-400">
                  {hasActiveFilter ? 'No transactions match the current filters.' : 'No bridge transactions yet.'}
                </td>
              </tr>
            )}

            {transactions.map((tx) => (
              <tr key={tx.id} className="border-b border-white/5 text-slate-200">
                <td className="px-4 py-3">
                  {bridgeChainName(tx.sourceChain)} → {bridgeChainName(tx.destChain)}
                </td>
                <td className="px-4 py-3 tabular-nums">
                  {tx.amount} {tx.tokenSymbol}
                </td>
                <td className="px-4 py-3">
                  <BridgeStatusStepper status={tx.status} failureReason={tx.failureReason} />
                </td>
                <td className="px-4 py-3">
                  <EstimatedCompletion tx={tx} now={now} />
                </td>
                <td className="px-4 py-3 text-slate-400">{format(new Date(tx.initiatedAt), 'MMM d, HH:mm')}</td>
                <td className="px-4 py-3 text-right">
                  <Link
                    href={`/bridge/${tx.id}`}
                    className="rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-white/5"
                  >
                    View
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between gap-4 border-t border-white/10 px-4 py-3 text-sm text-slate-400">
        <span>
          Page {page} of {totalPages}
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            aria-label="Previous page"
            disabled={page <= 1}
            onClick={() => updateParams({ page: String(page - 1) }, false)}
            className="rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-40"
          >
            Previous
          </button>
          <button
            type="button"
            aria-label="Next page"
            disabled={page >= totalPages}
            onClick={() => updateParams({ page: String(page + 1) }, false)}
            className="rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-40"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  )
}
