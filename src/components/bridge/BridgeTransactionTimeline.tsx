'use client'

import { formatDistanceStrict } from 'date-fns'
import { BRIDGE_PIPELINE_STAGES, type BridgeTransaction } from '@/src/types/bridge'
import { bridgeStatusLabel, formatDurationSeconds, formatUsd } from '@/src/utils/bridgeFormat'
import { getBridgeRouteEstimateSeconds } from '@/src/config/bridgeChains'
import {
  BRIDGE_STAGE_DOT_CLASSES,
  BRIDGE_STAGE_ICONS,
  BRIDGE_STAGE_STATUS_TEXT,
  getStageStatuses,
} from '@/src/utils/bridgeStages'

const PENDING = <span className="text-slate-500">Pending</span>

function confirmationsForStage(
  stage: (typeof BRIDGE_PIPELINE_STAGES)[number],
  stageStatus: string,
  tx: BridgeTransaction,
) {
  if (stage === 'source_confirmed') {
    if (stageStatus === 'upcoming') return PENDING
    return `${tx.sourceConfirmations}/${tx.requiredSourceConfirmations} confirmations`
  }
  if (stage === 'dest_confirmed') {
    if (stageStatus === 'upcoming') return PENDING
    return `${tx.destConfirmations}/${tx.requiredDestConfirmations} confirmations`
  }
  return null
}

/**
 * Full five-stage timeline for the detail view: per-leg block confirmations,
 * gas, USD cost, and estimated-vs-actual completion time. Any value that
 * isn't knowable yet (destination gas pre-execution, USD cost the API hasn't
 * priced, completion time before the transfer finishes) renders an explicit
 * "Pending" label - never a bare 0, "-", or NaN standing in for unknown.
 */
export function BridgeTransactionTimeline({ tx }: { tx: BridgeTransaction }) {
  const stageStatuses = getStageStatuses(tx.status)
  const route = getBridgeRouteEstimateSeconds(tx.sourceChain, tx.destChain)

  const estimatedLabel = route ? `${formatDurationSeconds(route.min)} - ${formatDurationSeconds(route.max)}` : 'Unknown'
  const actualLabel = tx.completedAt
    ? formatDistanceStrict(new Date(tx.completedAt), new Date(tx.initiatedAt))
    : PENDING

  return (
    <div className="space-y-6">
      <ol aria-label="Bridge transaction timeline" className="space-y-3">
        {BRIDGE_PIPELINE_STAGES.map((stage, i) => {
          const stageStatus = stageStatuses[i]
          const confirmations = confirmationsForStage(stage, stageStatus, tx)
          return (
            <li key={stage} className="flex items-start gap-3">
              <span
                aria-hidden="true"
                title={`${bridgeStatusLabel(stage)} - ${BRIDGE_STAGE_STATUS_TEXT[stageStatus]}`}
                className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${BRIDGE_STAGE_DOT_CLASSES[stageStatus]}`}
              >
                {BRIDGE_STAGE_ICONS[stageStatus]}
              </span>
              <div>
                <p className="text-sm font-medium text-white">
                  {bridgeStatusLabel(stage)}
                  <span className="ml-2 text-xs font-normal text-slate-500">({BRIDGE_STAGE_STATUS_TEXT[stageStatus]})</span>
                </p>
                {confirmations && <p className="text-xs text-slate-400">{confirmations}</p>}
              </div>
            </li>
          )
        })}
      </ol>

      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 border-t border-white/10 pt-4 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-xs uppercase tracking-wide text-slate-500">Source Gas Used</dt>
          <dd className="text-slate-200">{tx.sourceGasUsed ?? PENDING}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-slate-500">Est. Destination Gas</dt>
          <dd className="text-slate-200">{tx.estimatedDestGas ?? PENDING}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-slate-500">Actual Destination Gas</dt>
          <dd className="text-slate-200">{tx.destGasUsed ?? PENDING}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-slate-500">Total Cost (USD)</dt>
          <dd className="text-slate-200">{formatUsd(tx.usdCost)}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-slate-500">Estimated Completion</dt>
          <dd className="text-slate-200">{estimatedLabel}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-slate-500">Actual Completion</dt>
          <dd className="text-slate-200">{actualLabel}</dd>
        </div>
      </dl>
    </div>
  )
}
