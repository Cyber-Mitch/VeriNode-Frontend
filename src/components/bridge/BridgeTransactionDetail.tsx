'use client'

import { format } from 'date-fns'
import { useBridgeTransactionDetail } from '@/src/hooks/useBridgeTransactionDetail'
import { BRIDGE_CHAIN_META, bridgeChainName } from '@/src/config/bridgeChains'
import { BridgeStatusStepper } from '@/src/components/bridge/BridgeStatusStepper'
import { BridgeTransactionTimeline } from '@/src/components/bridge/BridgeTransactionTimeline'
import { BridgeFailureRecovery } from '@/src/components/bridge/BridgeFailureRecovery'

export interface BridgeTransactionDetailProps {
  id: string
}

export function BridgeTransactionDetail({ id }: BridgeTransactionDetailProps) {
  const { transaction, isLoading, isError, error, refresh } = useBridgeTransactionDetail(id)

  if (isLoading) {
    return (
      <div className="space-y-3 rounded-2xl border border-white/10 bg-slate-950/40 p-6">
        <div className="h-6 w-1/3 animate-pulse rounded bg-slate-800" />
        <div className="h-4 w-2/3 animate-pulse rounded bg-slate-800" />
        <div className="h-32 w-full animate-pulse rounded bg-slate-800" />
      </div>
    )
  }

  if (isError) {
    return (
      <div role="alert" className="rounded-2xl border border-red-500/30 bg-red-950/20 p-6 text-sm text-red-300">
        {error?.message ?? 'Failed to load this bridge transaction.'}
      </div>
    )
  }

  if (!transaction) {
    return (
      <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-6 text-sm text-slate-400">
        Transaction not found.
      </div>
    )
  }

  return (
    <div className="space-y-6 rounded-2xl border border-white/10 bg-slate-950/40 p-6 text-white">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">
            {bridgeChainName(transaction.sourceChain)} → {bridgeChainName(transaction.destChain)}
          </h2>
          <p className="text-sm text-slate-400">
            {transaction.amount} {transaction.tokenSymbol} · Initiated {format(new Date(transaction.initiatedAt), 'MMM d, yyyy HH:mm')}
          </p>
        </div>
        <BridgeStatusStepper status={transaction.status} failureReason={transaction.failureReason} />
      </div>

      <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-400">
        <a
          href={BRIDGE_CHAIN_META[transaction.sourceChain].explorerTxUrl(transaction.sourceTxHash)}
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-slate-200"
        >
          Source tx on {bridgeChainName(transaction.sourceChain)}
        </a>
        {transaction.destTxHash ? (
          <a
            href={BRIDGE_CHAIN_META[transaction.destChain].explorerTxUrl(transaction.destTxHash)}
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-slate-200"
          >
            Destination tx on {bridgeChainName(transaction.destChain)}
          </a>
        ) : (
          <span>Destination tx: pending</span>
        )}
      </div>

      {transaction.failureReason && (
        <BridgeFailureRecovery
          transactionId={transaction.id}
          failureReason={transaction.failureReason}
          onActionComplete={refresh}
        />
      )}

      <BridgeTransactionTimeline tx={transaction} />
    </div>
  )
}
