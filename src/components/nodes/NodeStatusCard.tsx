'use client'

import type { AttestationStatus } from '@/src/hooks/useNodeStatus'

const STATUS_META: Record<AttestationStatus, { color: string; label: string }> = {
  attested: { color: '#22c55e', label: 'Attested' },
  pending: { color: '#f59e0b', label: 'Pending' },
  slashed: { color: '#ef4444', label: 'Slashed' },
}

const UNKNOWN_COLOR = '#64748b'

/**
 * Per-node attestation status indicator. Purely presentational: it renders the
 * status it is handed, so the flicker fix lives entirely in the data layer
 * (useNodeStatus reducer + useNodeStream dedup buffer). `data-status` is
 * exposed for visual-regression assertions.
 */
export function NodeStatusCard({
  nodeId,
  status,
}: {
  nodeId: string
  status?: AttestationStatus
}) {
  const meta = status ? STATUS_META[status] : null
  const color = meta?.color ?? UNKNOWN_COLOR

  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-slate-900/70 px-4 py-3 text-white">
      <span
        className="inline-flex h-3 w-3 shrink-0 rounded-full"
        style={{ backgroundColor: color, boxShadow: `0 0 8px ${color}66` }}
        data-testid={`node-status-${nodeId}`}
        data-status={status ?? 'unknown'}
        aria-label={`Node ${nodeId} status: ${meta?.label ?? 'Unknown'}`}
      />
      <div className="min-w-0">
        <p className="truncate font-mono text-sm">{nodeId}</p>
        <p className="text-xs text-slate-400">{meta?.label ?? 'Unknown'}</p>
      </div>
    </div>
  )
}
