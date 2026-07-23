import type { BridgeTxStatus } from '@/src/types/bridge'

const STATUS_LABELS: Record<BridgeTxStatus, string> = {
  initiated: 'Initiated',
  source_confirmed: 'Source Confirmed',
  bridge_in_progress: 'Bridge In Progress',
  dest_confirmed: 'Destination Confirmed',
  complete: 'Complete',
  failed_gas: 'Failed (Gas)',
  failed_stuck_deposit: 'Failed (Stuck Deposit)',
}

export function bridgeStatusLabel(status: BridgeTxStatus): string {
  return STATUS_LABELS[status]
}

export function formatUsd(value: number | null): string {
  if (value === null) return 'Pending'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value)
}

/** Formats a whole-seconds duration as e.g. "3m 20s" / "1h 05m". Negative or non-finite input renders as "0s". */
export function formatDurationSeconds(totalSeconds: number): string {
  const seconds = Number.isFinite(totalSeconds) ? Math.max(0, Math.round(totalSeconds)) : 0
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60

  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, '0')}m`
  if (minutes > 0) return `${minutes}m ${String(secs).padStart(2, '0')}s`
  return `${secs}s`
}
