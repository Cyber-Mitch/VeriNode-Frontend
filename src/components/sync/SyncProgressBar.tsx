'use client'

import { formatTimeRemaining, speedTrendArrow } from '@/src/utils/syncHistogram'
import type { SyncStatus } from '@/src/types/sync'

interface SyncProgressBarProps {
  syncStatus: SyncStatus
}

/**
 * Animated progress bar showing current block height vs network tip, with
 * download speed, estimated time remaining, and a trend arrow.
 */
export function SyncProgressBar({ syncStatus }: SyncProgressBarProps) {
  const {
    currentHeight,
    networkTipHeight,
    downloadSpeedBps,
    estimatedSecondsRemaining,
    phase,
    speedHistory,
  } = syncStatus

  const pct =
    networkTipHeight > 0
      ? Math.min(100, (currentHeight / networkTipHeight) * 100)
      : 0

  const isSynced = phase === 'synced'
  const isStalled = phase === 'stalled'

  const barColor = isSynced
    ? 'bg-emerald-500'
    : isStalled
      ? 'bg-amber-500'
      : 'bg-sky-500'

  const trend = speedTrendArrow(speedHistory)

  return (
    <div
      className="space-y-3"
      role="region"
      aria-label="Node synchronization progress"
    >
      {/* Height labels */}
      <div className="flex items-baseline justify-between text-xs text-slate-400">
        <span>
          Block{' '}
          <span className="font-mono font-semibold text-slate-200">
            {currentHeight.toLocaleString()}
          </span>
        </span>
        <span>
          Tip{' '}
          <span className="font-mono font-semibold text-slate-200">
            {networkTipHeight.toLocaleString()}
          </span>
        </span>
      </div>

      {/* Progress track */}
      <div
        className="relative h-3 w-full overflow-hidden rounded-full bg-slate-700/60"
        role="progressbar"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Sync progress ${pct.toFixed(1)}%`}
      >
        <div
          className={`h-full rounded-full transition-all duration-500 ${barColor} ${
            !isSynced && !isStalled ? 'animate-pulse' : ''
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Stats row */}
      <div className="flex flex-wrap items-center gap-4 text-xs text-slate-400">
        <span>
          <span className="font-semibold text-slate-200">{pct.toFixed(2)}%</span> synced
        </span>

        {!isSynced && !isStalled && (
          <>
            <span>
              Speed{' '}
              <span className="font-semibold text-sky-300">
                {downloadSpeedBps.toFixed(1)} blk/s
              </span>{' '}
              <span aria-hidden="true">{trend}</span>
            </span>

            {estimatedSecondsRemaining !== null && (
              <span>
                ETA{' '}
                <span className="font-semibold text-sky-300">
                  {formatTimeRemaining(estimatedSecondsRemaining)}
                </span>
              </span>
            )}

            <span>
              Blocks remaining{' '}
              <span className="font-semibold text-slate-200">
                {(networkTipHeight - currentHeight).toLocaleString()}
              </span>
            </span>
          </>
        )}

        {isSynced && (
          <span className="font-semibold text-emerald-400">Fully synced</span>
        )}

        {isStalled && (
          <span className="font-semibold text-amber-400">Sync stalled</span>
        )}
      </div>
    </div>
  )
}
