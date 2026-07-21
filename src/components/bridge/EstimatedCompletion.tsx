'use client'

import { getBridgeRouteEstimateSeconds } from '@/src/config/bridgeChains'
import { isBridgeFailureStatus, type BridgeTransaction } from '@/src/types/bridge'
import { formatDurationSeconds } from '@/src/utils/bridgeFormat'

export interface EstimatedCompletionProps {
  tx: BridgeTransaction
  /** Caller-supplied clock reading (epoch ms). Reading Date.now() during render is impure, so the caller snapshots it - see BridgeTransactionList. */
  now: number
}

/**
 * Progress bar + remaining-time estimate derived from the historical
 * min-max completion range for this route. Renders "Unknown" rather than
 * NaN/0 when no historical range exists for the route, and caps the bar at
 * 100% with a "taking longer than expected" message once elapsed time
 * exceeds the max estimate rather than showing negative/overflowing progress.
 */
export function EstimatedCompletion({ tx, now }: EstimatedCompletionProps) {
  if (isBridgeFailureStatus(tx.status)) {
    return <span className="text-xs text-red-400">Action needed</span>
  }

  if (tx.status === 'complete') {
    return <span className="text-xs text-emerald-400">Complete</span>
  }

  const route = getBridgeRouteEstimateSeconds(tx.sourceChain, tx.destChain)
  if (!route) {
    return <span className="text-xs text-slate-500">Unknown</span>
  }

  const elapsedSeconds = Math.max(0, (now - new Date(tx.initiatedAt).getTime()) / 1000)
  const overMax = elapsedSeconds > route.max
  const progressPct = Math.max(0, Math.min(100, (elapsedSeconds / route.max) * 100))
  const remainingSeconds = route.max - elapsedSeconds

  return (
    <div className="w-32">
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
        <div
          className={`h-full rounded-full transition-all duration-300 ease-out ${overMax ? 'bg-amber-500' : 'bg-sky-500'}`}
          style={{ width: `${progressPct}%` }}
        />
      </div>
      <p className="mt-1 text-[11px] text-slate-400">
        {overMax ? 'Taking longer than expected' : `~${formatDurationSeconds(remainingSeconds)} remaining`}
      </p>
    </div>
  )
}
