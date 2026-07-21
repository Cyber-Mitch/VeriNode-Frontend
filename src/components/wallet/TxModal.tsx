'use client'

import { useCallback } from 'react'
import { FeeBreakdown } from '@/src/components/wallet/FeeBreakdown'
import { usePreflightSimulation } from '@/src/hooks/usePreflightSimulation'
import { transactionLabel, type SorobanTransaction } from '@/src/lib/stellar/transaction'

function SkeletonBar() {
  return (
    <div className="space-y-1">
      <div className="h-3 w-40 animate-pulse rounded bg-slate-700/60" />
      <div className="h-1.5 w-full animate-pulse rounded-full bg-slate-800" />
    </div>
  )
}

function PreflightSkeleton() {
  return (
    <div className="space-y-4" data-testid="preflight-skeleton" aria-busy="true">
      <SkeletonBar />
      <SkeletonBar />
      <SkeletonBar />
      <div className="h-12 w-full animate-pulse rounded-xl bg-slate-800/60" />
    </div>
  )
}

/**
 * Pre-flight transaction modal. On open it simulates the transaction and shows
 * an accurate fee/resource breakdown before the user approves in their wallet.
 * The "Approve in Wallet" action is enabled only once a result is available.
 */
export function TxModal({
  transaction,
  open,
  onClose,
  onApprove,
}: {
  transaction: SorobanTransaction | null
  open: boolean
  onClose: () => void
  onApprove?: (transaction: SorobanTransaction) => void
}) {
  const state = usePreflightSimulation(transaction, { enabled: open })

  const handleApprove = useCallback(() => {
    if (transaction && state.result) onApprove?.(transaction)
  }, [transaction, state.result, onApprove])

  if (!open || !transaction) return null

  const isLoading = state.status === 'loading'
  const isEstimated = state.status === 'timeout' || state.status === 'fallback'
  const canApprove = !isLoading && state.result !== null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Transaction pre-flight"
      data-testid="tx-modal"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-3xl border border-white/10 bg-slate-900 p-6 text-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">Confirm {transactionLabel(transaction.type)}</h2>
            <p className="text-sm text-slate-400">Pre-flight resource &amp; fee estimate</p>
          </div>
          {isEstimated && (
            <span
              data-testid="estimated-badge"
              className="rounded-full bg-amber-500/15 px-2.5 py-1 text-[10px] font-semibold text-amber-400"
            >
              {state.status === 'timeout' ? 'CONSERVATIVE ESTIMATE' : 'ESTIMATED (SIMULATION UNAVAILABLE)'}
            </span>
          )}
          {state.status === 'success' && state.fromCache && (
            <span className="rounded-full bg-slate-700/40 px-2.5 py-1 text-[10px] font-semibold text-slate-300">
              CACHED
            </span>
          )}
        </div>

        {state.timedOut && (
          <p
            data-testid="timeout-warning"
            className="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300"
          >
            Simulation timing out — using conservative estimate.
          </p>
        )}

        <div className="mb-5">
          {isLoading || !state.result ? (
            <PreflightSkeleton />
          ) : (
            <FeeBreakdown result={state.result} />
          )}
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl border border-white/10 px-4 py-2.5 text-sm font-medium text-slate-300 hover:bg-white/5"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleApprove}
            disabled={!canApprove}
            data-testid="approve-wallet"
            className="flex-1 rounded-xl bg-sky-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-sky-400 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
          >
            {isLoading ? 'Simulating…' : 'Approve in Wallet'}
          </button>
        </div>
      </div>
    </div>
  )
}
