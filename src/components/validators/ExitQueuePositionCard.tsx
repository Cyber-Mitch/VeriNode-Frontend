'use client'

import { useEffect, useMemo, useState } from 'react'
import { EWMATrendline } from '@/src/components/charts/EWMATrendline'
import { useExitQueuePosition } from '@/src/hooks/useExitQueuePosition'

function formatEta(ms: number | null): string {
  if (ms === null) return '—'
  if (ms <= 0) return 'imminent'
  const minutes = ms / 60_000
  if (minutes < 60) return `${Math.round(minutes)} min`
  const hours = minutes / 60
  if (hours < 48) return `${hours.toFixed(1)} h`
  return `${(hours / 24).toFixed(1)} d`
}

function formatDate(ms: number | null): string {
  if (ms === null) return '—'
  return new Date(ms).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * Exit-queue position card for one validator: current position offset, total
 * queue depth, EWMA churn rate, and the projected exit epoch / ETA, with depth
 * and churn trendlines. Surfaces the 4-epoch slashing delay when applicable.
 */
export function ExitQueuePositionCard({
  validatorIndex,
  beaconNodeUrl,
}: {
  validatorIndex: number
  beaconNodeUrl?: string
}) {
  const { projection, samples, ewmaSeries, isLoading, error } = useExitQueuePosition(validatorIndex, {
    beaconNodeUrl,
  })

  // Live clock for the ETA countdown (kept out of render to stay pure).
  const [now, setNow] = useState(0)
  useEffect(() => {
    const tick = () => setNow(Date.now())
    tick()
    const id = window.setInterval(tick, 1000)
    return () => window.clearInterval(id)
  }, [])

  const depthSeries = useMemo(() => samples.map((s) => s.queueDepth), [samples])
  const churnSeries = useMemo(
    () => samples.map((s) => Math.min(s.queueDepth, s.churnLimit)),
    [samples],
  )

  const etaMs =
    now > 0 && projection?.projectedExitTimestamp !== null && projection?.projectedExitTimestamp !== undefined
      ? projection.projectedExitTimestamp - now
      : null

  return (
    <section className="rounded-2xl border border-white/10 bg-slate-900/70 p-5 text-white">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h4 className="font-mono text-sm font-semibold">Validator #{validatorIndex}</h4>
          <p className="text-xs text-slate-500">Exit queue position</p>
        </div>
        {projection?.slashed && (
          <span className="rounded-full bg-red-500/15 px-2.5 py-1 text-[10px] font-semibold text-red-400">
            SLASHED · +4 EPOCH DELAY
          </span>
        )}
      </div>

      {error && <p className="mb-3 text-sm text-red-400">{error}</p>}

      {isLoading && samples.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-400">Reading exit queue…</p>
      ) : !projection ? (
        <p className="py-6 text-center text-sm text-slate-400">No queue data.</p>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <Stat label="Position" value={projection.positionOffset.toLocaleString()} tone="text-sky-300" />
            <Stat label="Queue depth" value={projection.queueDepth.toLocaleString()} />
            <Stat label="Churn (EWMA)" value={`${projection.ewmaChurn.toFixed(1)}/epoch`} />
            <Stat
              label="Exit epoch"
              value={projection.projectedExitEpoch?.toLocaleString() ?? '—'}
              tone="text-sky-300"
            />
          </div>

          <div className="rounded-xl border border-white/10 bg-slate-950/60 p-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-400">Projected exit</span>
              <span className="font-semibold">{formatDate(projection.projectedExitTimestamp)}</span>
            </div>
            <div className="mt-1 flex items-center justify-between text-xs text-slate-500">
              <span>
                ETA {formatEta(etaMs)}
                {projection.epochsRemaining !== null && ` · ${projection.epochsRemaining.toLocaleString()} epochs`}
              </span>
            </div>
          </div>

          <EWMATrendline values={depthSeries} label="Queue depth" color="#f59e0b" />
          <EWMATrendline values={churnSeries} ewma={ewmaSeries} label="Churn rate · EWMA α=0.3" />
        </div>
      )}
    </section>
  )
}

function Stat({ label, value, tone = 'text-slate-100' }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-slate-950/60 p-3">
      <p className="text-[11px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 font-semibold ${tone}`}>{value}</p>
    </div>
  )
}
