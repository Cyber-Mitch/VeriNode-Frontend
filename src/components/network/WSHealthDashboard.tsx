'use client'

import type { ReactElement } from 'react'
import { useMemo } from 'react'
import { useWebSocketHealth } from '@/src/hooks/useWebSocketHealth'
import type { WebSocketTier } from '@/src/types/webSocketHealth'

function tierBadgeStyles(tier: WebSocketTier): { bg: string; text: string; border: string } {
  switch (tier) {
    case 1:
      return { bg: 'bg-emerald-500/15', text: 'text-emerald-300', border: 'border-emerald-500/30' }
    case 2:
      return { bg: 'bg-amber-500/15', text: 'text-amber-300', border: 'border-amber-500/30' }
    case 3:
      return { bg: 'bg-red-500/15', text: 'text-red-300', border: 'border-red-500/30' }
  }
}

function scoreTone(score: number): { bar: string; chip: string } {
  if (score >= 80) return { bar: 'bg-emerald-500', chip: 'text-emerald-300' }
  if (score >= 50) return { bar: 'bg-amber-500', chip: 'text-amber-300' }
  return { bar: 'bg-red-500', chip: 'text-red-300' }
}

function renderLatencySparkline(valuesMs: number[]): ReactElement {
  const width = 120
  const height = 24
  const capMs = 1_000

  const points = valuesMs
    .slice(-12)
    .map((v, idx, arr) => {
      const x = (idx / Math.max(1, arr.length - 1)) * width
      const clamped = Math.max(0, Math.min(capMs, v))
      const y = height - (clamped / capMs) * height
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="Latency sparkline (1 minute)"
      className="shrink-0"
    >
      <polyline
        points={points}
        fill="none"
        stroke="rgba(59,130,246,0.9)"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function WSHealthDashboard() {
  const { connections, tier3Connections, retry } = useWebSocketHealth()

  const showTier3 = tier3Connections.length > 0

  const tier3Label = useMemo(() => {
    if (!showTier3) return null
    const count = tier3Connections.length
    return `${count} connection${count !== 1 ? 's' : ''} need manual retry`
  }, [showTier3, tier3Connections.length])

  return (
    <section className="rounded-3xl border border-white/10 bg-slate-900/80 p-6 text-white" aria-label="WebSocket health">
      {showTier3 && (
        <div
          className="mb-5 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3"
          role="alert"
          aria-live="polite"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              <p className="text-sm font-semibold text-red-200">{tier3Label}</p>
              <p className="text-xs text-red-200/80">
                Auth / version mismatches stopped auto-reconnect. Use Retry to restore the stream.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {tier3Connections.slice(0, 3).map((c) => (
                <button
                  key={c.connectionId}
                  type="button"
                  onClick={() => retry(c.connectionId)}
                  className="rounded-lg border border-red-300 bg-red-600/10 px-3 py-1 text-xs font-semibold text-red-200 hover:bg-red-600/20 focus:outline-none focus:ring-2 focus:ring-red-400/30"
                >
                  Retry
                </button>
              ))}
              {tier3Connections.length > 3 && (
                <span className="text-xs text-red-200/80">+{tier3Connections.length - 3} more</span>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-xl font-semibold">WebSocket Connection Health</h2>
          <p className="text-sm text-slate-400">Real-time 0–100 scoring with tiered reconnection.</p>
        </div>
      </div>

      {connections.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-6 text-center text-sm text-slate-400">
          No active WebSocket connections registered.
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-slate-950/30">
          <table className="w-full border-collapse">
            <thead className="bg-slate-950/40 text-left">
              <tr className="text-xs text-slate-400">
                <th className="px-4 py-3 font-semibold">Connection</th>
                <th className="px-4 py-3 font-semibold">Health</th>
                <th className="px-4 py-3 font-semibold">Tier</th>
                <th className="px-4 py-3 font-semibold">Latency</th>
                <th className="px-4 py-3 font-semibold">Reconnects</th>
                <th className="px-4 py-3 font-semibold">Action</th>
              </tr>
            </thead>
            <tbody>
              {connections.map((c) => {
                const tone = scoreTone(c.healthScore)
                const badge = tierBadgeStyles(c.tierStatus.tier)
                const needsManual = c.tierStatus.tier === 3 && !c.autoReconnectEnabled
                const dotColor = c.connected ? 'bg-emerald-400' : 'bg-slate-500'
                const connectionLabel =
                  c.url.length > 28 ? `${c.url.slice(0, 22)}…${c.url.slice(-6)}` : c.url

                return (
                  <tr key={c.connectionId} className="border-t border-white/5 text-sm">
                    <td className="px-4 py-3">
                      <div className="flex items-start gap-3">
                        <span className={`mt-1 inline-block h-2.5 w-2.5 rounded-full ${dotColor}`} aria-hidden="true" />
                        <div>
                          <div className="font-semibold">{connectionLabel}</div>
                          {c.lastClose?.reason ? (
                            <div className="mt-1 text-xs text-slate-400">{c.lastClose.reason}</div>
                          ) : (
                            <div className="mt-1 text-xs text-slate-500">
                              {c.connected ? 'Connected' : c.lastClose?.closeCode ? `Closed (${c.lastClose.closeCode})` : 'Disconnected'}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>

                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex w-36 flex-col gap-2">
                          <div className="h-2 w-full overflow-hidden rounded-full bg-white/10" aria-hidden="true">
                            <div
                              className={`h-full rounded-full ${tone.bar}`}
                              style={{ width: `${c.healthScore}%` }}
                            />
                          </div>
                          <div className="flex justify-between text-xs text-slate-400">
                            <span>0</span>
                            <span className="font-semibold text-white">{c.healthScore}</span>
                            <span>100</span>
                          </div>
                        </div>
                      </div>
                    </td>

                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${badge.bg} ${badge.text} ${badge.border}`}
                      >
                        Tier {c.tierStatus.tier}
                      </span>
                    </td>

                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="min-w-[72px] text-xs text-slate-300">
                          {Math.round(c.avgMessageLatencyMs)}ms
                        </div>
                        {renderLatencySparkline(c.latencySparklineMs)}
                      </div>
                    </td>

                    <td className="px-4 py-3 text-slate-300">
                      {c.reconnectAttempts}
                    </td>

                    <td className="px-4 py-3">
                      {needsManual ? (
                        <button
                          type="button"
                          onClick={() => retry(c.connectionId)}
                          className="rounded-lg border border-red-300 bg-red-600/10 px-3 py-1 text-xs font-semibold text-red-200 hover:bg-red-600/20 focus:outline-none focus:ring-2 focus:ring-red-400/30"
                        >
                          Retry
                        </button>
                      ) : (
                        <span className="text-xs text-slate-500">{c.autoReconnectEnabled ? 'Auto' : 'Stopped'}</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

