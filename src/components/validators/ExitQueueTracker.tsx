'use client'

import { useMemo, useState } from 'react'
import { useExitQueue } from '@/src/hooks/useExitQueue'
import { QueuePosition } from '@/src/components/validators/QueuePosition'
import { QueueDepthChart } from '@/src/components/validators/QueueDepthChart'
import { ChurnRateChart } from '@/src/components/validators/ChurnRateChart'
import { ExitNotification } from '@/src/components/validators/ExitNotification'
import { ExitCompleteAlert } from '@/src/components/validators/ExitCompleteAlert'

function formatDate(ms: number | null): string {
  if (ms === null) return '—'
  return new Date(ms).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function Stat({
  label,
  value,
  tone = 'text-slate-100',
}: {
  label: string
  value: string
  tone?: string
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-slate-950/60 p-3">
      <p className="text-[11px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 font-semibold ${tone}`}>{value}</p>
    </div>
  )
}

/**
 * Full exit queue tracker for one validator. Wraps queue position gauge,
 * historical queue depth area chart, 7-day churn rate bar chart, near-exit
 * notification toggle, and exit-complete congratulatory alert.
 *
 * Poll interval: one epoch (≈6.4 min) aligned to epoch boundaries.
 */
export function ExitQueueTracker({
  validatorIndex,
  beaconNodeUrl,
}: {
  validatorIndex: number
  beaconNodeUrl?: string
}) {
  const {
    projection,
    samples,
    isLoading,
    error,
    isNearExit,
    hasExited,
    notificationsEnabled,
    toggleNotifications,
  } = useExitQueue(validatorIndex, { beaconNodeUrl })

  const [exitDismissed, setExitDismissed] = useState(false)

  const churnLimitDisplay = useMemo(() => {
    if (!projection) return '—'
    // Churn limit: max(4, active_validator_count / 1024)
    return `${projection.churnLimit.toLocaleString()} / epoch`
  }, [projection])

  return (
    <div className="space-y-5">
      {/* Exit complete alert */}
      {hasExited && !exitDismissed && (
        <ExitCompleteAlert
          validatorIndex={validatorIndex}
          exitEpoch={projection?.projectedExitEpoch ?? null}
          onDismiss={() => setExitDismissed(true)}
        />
      )}

      {/* Near-exit alert strip */}
      {isNearExit && !hasExited && (
        <div
          role="alert"
          aria-live="polite"
          className="flex items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm"
        >
          <span className="h-2 w-2 animate-pulse rounded-full bg-amber-400" aria-hidden="true" />
          <span className="text-amber-300">
            Validator #{validatorIndex} is within {projection?.positionOffset ?? 0} positions of
            exit — standby for withdrawal.
          </span>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-mono text-sm font-semibold text-slate-200">
            Validator #{validatorIndex}
          </h3>
          <p className="text-xs text-slate-500">Exit queue tracker</p>
        </div>
        {projection?.slashed && (
          <span className="rounded-full bg-red-500/15 px-2.5 py-1 text-[10px] font-semibold text-red-400">
            SLASHED · +4 EPOCH DELAY
          </span>
        )}
      </div>

      {error && (
        <p className="rounded-lg bg-red-500/10 px-4 py-2 text-sm text-red-400" role="alert">
          {error}
        </p>
      )}

      {isLoading && samples.length === 0 ? (
        <p className="py-10 text-center text-sm text-slate-400">Reading exit queue…</p>
      ) : !projection ? (
        <p className="py-10 text-center text-sm text-slate-400">No exit queue data available.</p>
      ) : (
        <div className="space-y-5">
          {/* Gauge + metrics grid */}
          <div className="grid gap-5 sm:grid-cols-[auto_1fr]">
            {/* Queue position gauge */}
            <div className="relative flex items-center justify-center">
              <QueuePosition
                position={projection.positionOffset}
                queueDepth={projection.queueDepth}
                epochsRemaining={projection.epochsRemaining}
                projectedExitTimestamp={projection.projectedExitTimestamp}
              />
            </div>

            {/* Key metrics */}
            <div className="grid grid-cols-2 gap-3 text-sm">
              <Stat
                label="Position"
                value={projection.positionOffset.toLocaleString()}
                tone="text-sky-300"
              />
              <Stat
                label="Queue depth"
                value={projection.queueDepth.toLocaleString()}
              />
              <Stat
                label="Churn limit"
                value={churnLimitDisplay}
              />
              <Stat
                label="Churn (EWMA)"
                value={`${projection.ewmaChurn.toFixed(1)} / epoch`}
              />
              <Stat
                label="Exit epoch"
                value={projection.projectedExitEpoch?.toLocaleString() ?? '—'}
                tone="text-sky-300"
              />
              <Stat
                label="Estimated wait"
                value={
                  projection.epochsRemaining !== null
                    ? (() => {
                        const ms = projection.epochsRemaining * 384_000
                        const days = ms / 86_400_000
                        if (days < 1) {
                          const hours = ms / 3_600_000
                          return `${hours.toFixed(1)} h`
                        }
                        return `${days.toFixed(1)} d`
                      })()
                    : '—'
                }
              />
            </div>
          </div>

          {/* Projected exit date */}
          <div className="rounded-xl border border-white/10 bg-slate-950/60 px-4 py-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-400">Projected exit</span>
              <span className="font-semibold text-slate-100">
                {formatDate(projection.projectedExitTimestamp)}
              </span>
            </div>
            {projection.epochsRemaining !== null && (
              <p className="mt-1 text-xs text-slate-500">
                {projection.epochsRemaining.toLocaleString()} epochs remaining ·{' '}
                current epoch {projection.currentEpoch?.toLocaleString() ?? '—'}
              </p>
            )}
          </div>

          {/* Historical queue depth chart */}
          <QueueDepthChart samples={samples} />

          {/* 7-day churn rate bar chart */}
          <ChurnRateChart samples={samples} />

          {/* Notification toggle */}
          <ExitNotification
            validatorIndex={validatorIndex}
            enabled={notificationsEnabled}
            onToggle={toggleNotifications}
          />
        </div>
      )}
    </div>
  )
}
