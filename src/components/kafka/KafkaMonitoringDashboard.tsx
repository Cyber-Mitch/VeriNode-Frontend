'use client';

// KafkaMonitoringDashboard — top-level Kafka consumer lag & auto-scaling dashboard.
// Issue #109 — system-wide implementation.
//
// Renders:
//   • A summary row (total groups, critical count, healthy count)
//   • A card per consumer group (ConsumerGroupLagCard)
//   • A scaling-event history table (ScalingHistoryTable)
//   • Live refresh indicator and manual refresh button

import { useKafkaMonitoring } from '../../hooks/useKafkaMonitoring';
import { ConsumerGroupLagCard } from './ConsumerGroupLagCard';
import { ScalingHistoryTable } from './ScalingHistoryTable';
import { LagStatusBadge } from './LagStatusBadge';

function formatLastRefreshed(ts: number | null): string {
  if (!ts) return 'Never';
  return new Date(ts).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function KafkaMonitoringDashboard() {
  const {
    groups,
    scalingStatus,
    scalingHistory,
    isLoaded,
    error,
    lastRefreshedAt,
    triggerManualScale,
    refresh,
  } = useKafkaMonitoring();

  const groupList = Object.values(groups);
  const criticalCount = groupList.filter((g) => g.status === 'critical').length;
  const warningCount = groupList.filter((g) => g.status === 'warning').length;
  const healthyCount = groupList.filter((g) => g.status === 'healthy').length;

  return (
    <div className="space-y-6">
      {/* Dashboard header */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-white/10 bg-slate-900/80 px-6 py-4">
        <div>
          <h2 className="text-xl font-semibold text-white">
            Kafka Consumer Lag Monitoring
          </h2>
          <p className="mt-0.5 text-xs text-slate-400">
            Auto-scaling consumer groups — issue #109
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Summary pills */}
          {groupList.length > 0 && (
            <>
              {criticalCount > 0 && (
                <LagStatusBadge status="critical" label={`${criticalCount} Critical`} />
              )}
              {warningCount > 0 && (
                <LagStatusBadge status="warning" label={`${warningCount} Warning`} />
              )}
              <LagStatusBadge status="healthy" label={`${healthyCount} Healthy`} />
            </>
          )}

          {/* Refresh controls */}
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <span>Last refresh: {formatLastRefreshed(lastRefreshedAt)}</span>
            <button
              type="button"
              onClick={() => void refresh()}
              className="rounded-lg border border-white/10 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-400"
              aria-label="Manually refresh Kafka consumer lag data"
            >
              ↺ Refresh
            </button>
          </div>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div
          role="alert"
          className="rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-300"
        >
          {error}
        </div>
      )}

      {/* Loading state */}
      {!isLoaded && !error && (
        <div className="flex items-center justify-center py-16 text-slate-500 text-sm">
          <span className="mr-2 inline-block h-4 w-4 animate-spin rounded-full border-2 border-slate-600 border-t-amber-400" aria-hidden="true" />
          Loading consumer group data…
        </div>
      )}

      {/* Group cards */}
      {isLoaded && groupList.length === 0 && !error && (
        <p className="py-10 text-center text-sm text-slate-500">
          No consumer groups found.
        </p>
      )}

      {isLoaded && groupList.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-1 lg:grid-cols-2 xl:grid-cols-3">
          {groupList.map((group) => (
            <ConsumerGroupLagCard
              key={group.groupId}
              group={group}
              scalingStatus={scalingStatus[group.groupId]}
              onManualScale={triggerManualScale}
            />
          ))}
        </div>
      )}

      {/* Scaling history */}
      {isLoaded && (
        <ScalingHistoryTable events={scalingHistory} />
      )}
    </div>
  );
}
