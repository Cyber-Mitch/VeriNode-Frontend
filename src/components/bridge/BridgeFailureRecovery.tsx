'use client'

import { useState } from 'react'
import { claimStuckDeposit, retryBridgeTransaction } from '@/src/lib/api/bridge'
import type { BridgeFailureReason } from '@/src/types/bridge'

type ActionState = 'idle' | 'pending' | 'success' | 'error'

export interface BridgeFailureRecoveryProps {
  transactionId: string
  failureReason: BridgeFailureReason
  onActionComplete?: () => void
}

/**
 * Renders the failure reason plus, only when the failure type is one we
 * understand, a single type-appropriate recovery action: Retry for gas
 * failures, Claim for stuck deposits. An unrecognized failure type shows the
 * reason with no button, rather than guessing at an action that might not
 * apply. The action button is disabled while its request is in flight (both
 * via the `disabled` attribute and an internal state check, so a rapid
 * double-click before React re-renders still can't fire twice), and surfaces
 * the request's own success/failure rather than assuming it worked.
 */
export function BridgeFailureRecovery({ transactionId, failureReason, onActionComplete }: BridgeFailureRecoveryProps) {
  const [state, setState] = useState<ActionState>('idle')
  const [actionErrorMessage, setActionErrorMessage] = useState<string | null>(null)

  async function runAction(action: () => Promise<void>) {
    if (state === 'pending') return
    setState('pending')
    setActionErrorMessage(null)
    try {
      await action()
      setState('success')
      onActionComplete?.()
    } catch (err) {
      setState('error')
      setActionErrorMessage(err instanceof Error ? err.message : 'The request failed. Please try again.')
    }
  }

  const isPending = state === 'pending'

  return (
    <div className="rounded-xl border border-red-500/30 bg-red-950/20 p-4">
      <p role="alert" className="text-sm text-red-300">
        {failureReason.message}
      </p>

      <div className="mt-3 flex items-center gap-3">
        {failureReason.type === 'gas_failure' && (
          <button
            type="button"
            disabled={isPending}
            onClick={() => runAction(() => retryBridgeTransaction(transactionId))}
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? 'Retrying…' : 'Retry'}
          </button>
        )}

        {failureReason.type === 'stuck_deposit' && (
          <button
            type="button"
            disabled={isPending}
            onClick={() => runAction(() => claimStuckDeposit(transactionId))}
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? 'Claiming…' : 'Claim'}
          </button>
        )}

        {state === 'success' && (
          <span role="status" className="text-xs text-emerald-400">
            Submitted - refreshing status…
          </span>
        )}
      </div>

      {state === 'error' && (
        <p role="alert" className="mt-2 text-xs text-red-400">
          {actionErrorMessage}
        </p>
      )}
    </div>
  )
}
