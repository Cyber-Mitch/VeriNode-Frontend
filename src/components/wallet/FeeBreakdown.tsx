'use client'

import { useMemo } from 'react'
import { FormattedBalance } from '@/src/components/shared/FormattedBalance'
import {
  INSTRUCTION_LIMIT,
  READ_BYTES_LIMIT,
  WRITE_BYTES_LIMIT,
  computeFee,
} from '@/src/lib/stellar/transaction'
import type { OperationCost, SimulationResult } from '@/src/lib/api/simulate'

const FOOTPRINT_PREVIEW = 5

function ResourceBar({
  label,
  value,
  limit,
  unit,
  testid,
}: {
  label: string
  value: number
  limit: number
  unit: string
  testid: string
}) {
  const pct = Math.min(100, limit > 0 ? (value / limit) * 100 : 0)
  const tone = pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-amber-500' : 'bg-emerald-500'
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between text-sm">
        <span className="text-slate-300">{label}</span>
        <span className="tabular-nums text-slate-400">
          <span data-testid={testid} className="font-medium text-slate-100">
            {value.toLocaleString()}
          </span>{' '}
          / {limit.toLocaleString()} {unit}
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function OperationRow({ op }: { op: OperationCost }) {
  const fee = computeFee(op.instructions, op.writeBytes, op.readBytes)
  return (
    <details className="rounded-lg border border-white/10 bg-slate-950/40 px-3 py-2">
      <summary className="flex cursor-pointer items-center justify-between text-sm text-slate-200">
        <span>{op.label}</span>
        <span className="tabular-nums text-xs text-slate-400">
          <FormattedBalance value={fee} aria-label={`${op.label} fee`} /> XLM
        </span>
      </summary>
      <dl className="mt-2 grid grid-cols-3 gap-2 text-xs text-slate-400">
        <div>
          <dt className="text-slate-500">Instructions</dt>
          <dd className="tabular-nums text-slate-200">{op.instructions.toLocaleString()}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Write bytes</dt>
          <dd className="tabular-nums text-slate-200">{op.writeBytes.toLocaleString()}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Read bytes</dt>
          <dd className="tabular-nums text-slate-200">{op.readBytes.toLocaleString()}</dd>
        </div>
      </dl>
    </details>
  )
}

/**
 * Renders the pre-flight resource breakdown: instruction/byte usage against
 * limits, the estimated XLM fee, the storage footprint, and a per-operation
 * accordion for multi-step transactions.
 */
export function FeeBreakdown({ result }: { result: SimulationResult }) {
  const fee = useMemo(
    () => computeFee(result.instructions, result.writeBytes, result.readBytes),
    [result.instructions, result.writeBytes, result.readBytes],
  )

  const footprint = useMemo(() => {
    return [
      ...result.footprint.readWrite.map((key) => ({ key, access: 'write' as const })),
      ...result.footprint.readOnly.map((key) => ({ key, access: 'read' as const })),
    ]
  }, [result.footprint])

  const previewKeys = footprint.slice(0, FOOTPRINT_PREVIEW)
  const remaining = footprint.slice(FOOTPRINT_PREVIEW)

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <ResourceBar
          label="Instructions consumed"
          value={result.instructions}
          limit={INSTRUCTION_LIMIT}
          unit=""
          testid="fee-instructions"
        />
        <ResourceBar
          label="Write bytes"
          value={result.writeBytes}
          limit={WRITE_BYTES_LIMIT}
          unit="B"
          testid="fee-write-bytes"
        />
        <ResourceBar
          label="Read bytes"
          value={result.readBytes}
          limit={READ_BYTES_LIMIT}
          unit="B"
          testid="fee-read-bytes"
        />
      </div>

      <div className="flex items-center justify-between rounded-xl border border-white/10 bg-slate-950/60 px-4 py-3">
        <span className="text-sm text-slate-300">Estimated fee</span>
        <span data-testid="fee-xlm" className="text-base font-semibold text-white">
          <FormattedBalance value={fee} aria-label="Estimated fee" /> XLM
        </span>
      </div>

      {result.operations.length > 1 && (
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-wide text-slate-500">Per-operation breakdown</p>
          <div className="space-y-2">
            {result.operations.map((op, i) => (
              <OperationRow key={`${op.type}-${i}`} op={op} />
            ))}
          </div>
        </div>
      )}

      <div className="space-y-2">
        <p className="text-xs uppercase tracking-wide text-slate-500">
          Storage footprint{footprint.length > 0 ? ` (${footprint.length})` : ''}
        </p>
        {footprint.length === 0 ? (
          <p className="text-sm text-slate-500">No storage footprint reported.</p>
        ) : (
          <ul className="space-y-1" data-testid="footprint-list">
            {previewKeys.map((entry) => (
              <li key={entry.key} className="flex items-center gap-2 text-xs">
                <span
                  className={`rounded px-1.5 py-0.5 font-medium ${
                    entry.access === 'write'
                      ? 'bg-sky-500/15 text-sky-300'
                      : 'bg-slate-700/40 text-slate-300'
                  }`}
                >
                  {entry.access === 'write' ? 'RW' : 'RO'}
                </span>
                <span className="truncate font-mono text-slate-300">{entry.key}</span>
              </li>
            ))}
            {remaining.length > 0 && (
              <li>
                <details>
                  <summary className="cursor-pointer text-xs text-sky-400">
                    and {remaining.length} more
                  </summary>
                  <ul className="mt-1 space-y-1">
                    {remaining.map((entry) => (
                      <li key={entry.key} className="flex items-center gap-2 text-xs">
                        <span
                          className={`rounded px-1.5 py-0.5 font-medium ${
                            entry.access === 'write'
                              ? 'bg-sky-500/15 text-sky-300'
                              : 'bg-slate-700/40 text-slate-300'
                          }`}
                        >
                          {entry.access === 'write' ? 'RW' : 'RO'}
                        </span>
                        <span className="truncate font-mono text-slate-300">{entry.key}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              </li>
            )}
          </ul>
        )}
      </div>
    </div>
  )
}
