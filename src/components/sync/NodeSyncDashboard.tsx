'use client'

import { useCallback } from 'react'
import { useSyncStatus } from '@/src/hooks/useSyncStatus'
import { SyncProgressBar } from '@/src/components/sync/SyncProgressBar'
import { PeerHeightHistogram } from '@/src/components/sync/PeerHeightHistogram'
import { SyncSpeedChart } from '@/src/components/sync/SyncSpeedChart'
import { StallIndicator } from '@/src/components/sync/StallIndicator'
import { formatTimeRemaining, speedTrendArrow } from '@/src/utils/syncHistogram'

interface NodeSyncDashboardProps {
  /** WebSocket URL for live sync updates. */
  wsUrl?: string
  /** REST polling interval in ms (0 = disabled). */
  pollIntervalMs?: number
  /** Force stall demo for testing/Storybook. */
  simulateStall?: boolean
}

function Metric({ label, value, tone = 'text-slate-100' }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-slate-950/60 p-3">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 font-semibold ${tone}`}>{value}</p>
    </div>
  )
}

/**
 * Node Synchronization Progress Tracker.
 *
 * Composes all sync sub-components into a single dashboard section:
 * - Animated progress bar (current height vs network tip)
 * - Key metrics (peers, speed, ETA, trend)
 * - Stall indicator with restart action (when phase === 'stalled')
 * - Peer block-height histogram
 * - Download speed / peer-count history chart
 *
 * Data is sourced from useSyncStatus which combines a REST snapshot with a
 * live WebSocket stream (GET /api/v1/node/sync-status + WS).
 */
export function NodeSyncDashboard({
  wsUrl,
  pollIntervalMs = 15_000,
  simulateStall = false,
}: NodeSyncDashboardProps) {
  const { syncStatus, isLoading, wsConnected, refresh } = useSyncStatus({
    wsUrl,
    pollIntervalMs,
    simulateStall,
  })

  const handleRestartSync = useCallback(() => {
    // In production this would POST to /api/v1/node/sync/restart.
    // For now we just re-fetch the status snapshot so the UI refreshes.
    refresh()
  }, [refresh])

  if (isLoading) {
    return (
      <section
        className="overflow-hidden rounded-3xl border border-white/10 bg-slate-900/80 text-white"
        aria-busy="true"
        aria-label="Loading sync status"
      >
        <div className="p-6 space-y-4">
          <div className="h-6 w-48 animate-pulse rounded bg-slate-700/60" />
          <div className="h-3 w-full animate-pulse rounded-full bg-slate-700/60" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-16 animate-pulse rounded-xl bg-slate-700/60" />
            ))}
          </div>
        </div>
      </section>
    )
  }

  if (!syncStatus) return null

  const {
    currentHeight,
    networkTipHeight,
    bestPeerHeight,
    downloadSpeedBps,
    estimatedSecondsRemaining,
    peerCount,
    peerHeights,
    phase,
    stallReason,
    stallMessage,
    lastProgressAt,
    speedHistory,
    peerCountHistory,
  } = syncStatus

  const isSynced = phase === 'synced'
  const isStalled = phase === 'stalled'
  const trend = speedTrendArrow(speedHistory)

  const phaseBadgeClass = isSynced
    ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
    : isStalled
      ? 'bg-amber-500/15 text-amber-400 border-amber-500/30'
      : 'bg-sky-500/15 text-sky-400 border-sky-500/30'

  const phaseLabel = isSynced ? 'Synced' : isStalled ? 'Stalled' : 'Syncing'

  return (
    <section
      className="overflow-hidden rounded-3xl border border-white/10 bg-slate-900/80 text-white"
      aria-label="Node synchronization progress tracker"
    >
      {/* ── Header ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-6 py-5">
        <div className="space-y-0.5">
          <h2 className="text-xl font-semibold">Node Sync Progress</h2>
          <p className="text-sm text-slate-400">
            Block height tracker &amp; peer comparison
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Phase badge */}
          <span
            className={`rounded-full border px-3 py-1 text-xs font-semibold ${phaseBadgeClass}`}
          >
            {phaseLabel}
          </span>

          {/* WS connection indicator */}
          <span
            className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${
              wsConnected
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                : 'border-slate-600/40 bg-slate-800/40 text-slate-500'
            }`}
            title={wsConnected ? 'Live WebSocket feed active' : 'Polling for updates'}
          >
            <span
              className={`inline-block h-1.5 w-1.5 rounded-full ${
                wsConnected ? 'bg-emerald-400' : 'bg-slate-500'
              }`}
              aria-hidden="true"
            />
            {wsConnected ? 'Live' : 'Polling'}
          </span>

          <button
            type="button"
            onClick={refresh}
            className="rounded-lg border border-white/10 px-3 py-1 text-xs text-slate-400 transition hover:bg-white/5 hover:text-slate-200"
            aria-label="Refresh sync status"
          >
            ↺ Refresh
          </button>
        </div>
      </div>

      <div className="space-y-6 px-6 py-5">
        {/* ── Progress bar ── */}
        <SyncProgressBar syncStatus={syncStatus} />

        {/* ── Key metrics ── */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Metric
            label="Current height"
            value={currentHeight.toLocaleString()}
          />
          <Metric
            label="Best peer"
            value={bestPeerHeight.toLocaleString()}
            tone={bestPeerHeight > currentHeight ? 'text-sky-300' : 'text-emerald-400'}
          />
          <Metric
            label="Connected peers"
            value={peerCount.toString()}
            tone={peerCount === 0 ? 'text-red-400' : 'text-slate-100'}
          />
          <Metric
            label="Download speed"
            value={
              isSynced || isStalled
                ? '—'
                : `${downloadSpeedBps.toFixed(1)} blk/s ${trend}`
            }
            tone="text-sky-300"
          />
          {!isSynced && estimatedSecondsRemaining !== null && (
            <Metric
              label="ETA"
              value={formatTimeRemaining(estimatedSecondsRemaining)}
              tone="text-sky-300"
            />
          )}
          <Metric
            label="Network tip"
            value={networkTipHeight.toLocaleString()}
          />
          {!isSynced && (
            <Metric
              label="Blocks remaining"
              value={(networkTipHeight - currentHeight).toLocaleString()}
            />
          )}
          {isSynced && (
            <Metric
              label="Status"
              value="Fully synced ✓"
              tone="text-emerald-400"
            />
          )}
        </div>

        {/* ── Stall warning ── */}
        {isStalled && (
          <StallIndicator
            stallReason={stallReason}
            stallMessage={stallMessage}
            onRestartSync={handleRestartSync}
            lastProgressAt={lastProgressAt}
          />
        )}

        {/* ── Peer height histogram ── */}
        <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
          <PeerHeightHistogram
            peerHeights={peerHeights}
            currentHeight={currentHeight}
          />
        </div>

        {/* ── Speed / peer-count history ── */}
        <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
          <p className="mb-3 text-sm font-medium text-slate-300">History</p>
          <SyncSpeedChart
            speedHistory={speedHistory}
            peerCountHistory={peerCountHistory}
          />
        </div>
      </div>
    </section>
  )
}
