'use client'

import type { StallReason } from '@/src/types/sync'

const STALL_LABELS: Record<StallReason, string> = {
  no_peers: 'No peers connected',
  slow_peer: 'Slow peer',
  processing_lag: 'Processing lag',
}

interface StallIndicatorProps {
  stallReason?: StallReason
  stallMessage?: string
  /** Called when the operator clicks "Restart sync". */
  onRestartSync?: () => void
  /** Unix-ms timestamp of the last detected progress. */
  lastProgressAt: number
}

/**
 * Warning panel displayed when the node's sync has stalled (no block progress
 * for 60 seconds). Shows the stall reason, a human-readable diagnostic
 * message, elapsed stall time, and a "Restart sync" action button.
 */
export function StallIndicator({
  stallReason,
  stallMessage,
  onRestartSync,
  lastProgressAt,
}: StallIndicatorProps) {
  const stalledForMs = Date.now() - lastProgressAt
  const stalledForSec = Math.floor(stalledForMs / 1_000)
  const stalledLabel =
    stalledForSec < 120
      ? `${stalledForSec} s`
      : `${Math.floor(stalledForSec / 60)} m ${stalledForSec % 60} s`

  const reasonLabel = stallReason ? STALL_LABELS[stallReason] : 'Unknown reason'

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="flex flex-col gap-3 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4"
    >
      {/* Header */}
      <div className="flex items-start gap-3">
        <span className="mt-0.5 text-xl leading-none" aria-hidden="true">
          ⚠
        </span>
        <div className="flex-1 space-y-1">
          <p className="font-semibold text-amber-300">Sync stall detected</p>
          <p className="text-xs text-amber-200/80">
            No block progress for{' '}
            <span className="font-semibold">{stalledLabel}</span>
          </p>
        </div>
      </div>

      {/* Reason + message */}
      <div className="rounded-xl border border-amber-500/20 bg-amber-950/30 px-3 py-2 text-xs space-y-1">
        <div className="flex gap-2 text-amber-200">
          <span className="font-semibold uppercase tracking-wide text-amber-400">Reason</span>
          <span>{reasonLabel}</span>
        </div>
        {stallMessage && (
          <p className="text-amber-200/70">{stallMessage}</p>
        )}
      </div>

      {/* Action */}
      {onRestartSync && (
        <button
          type="button"
          onClick={onRestartSync}
          className="self-start rounded-xl border border-amber-400/40 bg-amber-400/10 px-4 py-2 text-sm font-semibold text-amber-300 transition hover:bg-amber-400/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400"
          aria-label="Restart node synchronization"
        >
          Restart sync
        </button>
      )}
    </div>
  )
}
