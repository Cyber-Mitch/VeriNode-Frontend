'use client';

// LagStatusBadge — colour-coded pill indicating consumer group / partition health.
// Issue #109 — Kafka Consumer Lag Monitoring.

import type { PartitionLagStatus } from '../../types/kafka';

interface LagStatusBadgeProps {
  status: PartitionLagStatus;
  /** Accessible label override. Defaults to the status string. */
  label?: string;
}

const STATUS_STYLES: Record<PartitionLagStatus, string> = {
  healthy: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  warning: 'bg-amber-400/15 text-amber-400 border-amber-400/30',
  critical: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
};

const STATUS_DOT: Record<PartitionLagStatus, string> = {
  healthy: 'bg-emerald-400',
  warning: 'bg-amber-400 animate-pulse',
  critical: 'bg-rose-500 animate-pulse',
};

export function LagStatusBadge({ status, label }: LagStatusBadgeProps) {
  const displayLabel = label ?? status.charAt(0).toUpperCase() + status.slice(1);
  return (
    <span
      role="status"
      aria-label={`Lag status: ${displayLabel}`}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[status]}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[status]}`} aria-hidden="true" />
      {displayLabel}
    </span>
  );
}
