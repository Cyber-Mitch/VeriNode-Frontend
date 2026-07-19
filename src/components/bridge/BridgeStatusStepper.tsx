'use client'

import { BRIDGE_PIPELINE_STAGES, isBridgeFailureStatus, type BridgeFailureReason, type BridgeTxStatus } from '@/src/types/bridge'
import { bridgeStatusLabel } from '@/src/utils/bridgeFormat'
import { BRIDGE_STAGE_DOT_CLASSES, BRIDGE_STAGE_ICONS, BRIDGE_STAGE_STATUS_TEXT, getStageStatuses } from '@/src/utils/bridgeStages'

export interface BridgeStatusStepperProps {
  status: BridgeTxStatus
  failureReason?: BridgeFailureReason | null
}

/**
 * Compact per-row stage stepper for the transaction table. Each stage is a
 * small dot carrying an icon glyph (not color alone) plus a title tooltip;
 * the whole stepper has a single aria-label summarizing current state so
 * screen readers get one clear announcement instead of five dot readouts.
 */
export function BridgeStatusStepper({ status, failureReason }: BridgeStatusStepperProps) {
  const stageStatuses = getStageStatuses(status)
  const summary = isBridgeFailureStatus(status)
    ? `Failed: ${failureReason?.message ?? bridgeStatusLabel(status)}`
    : `${bridgeStatusLabel(status)}, stage ${BRIDGE_PIPELINE_STAGES.indexOf(status) + 1} of ${BRIDGE_PIPELINE_STAGES.length}`

  return (
    <ol aria-label={`Bridge progress: ${summary}`} className="flex items-center">
      {BRIDGE_PIPELINE_STAGES.map((stage, i) => {
        const stageStatus = stageStatuses[i]
        return (
          <li key={stage} className="flex items-center">
            <span
              aria-current={stageStatus === 'current' || stageStatus === 'failed' ? 'step' : undefined}
              title={`${bridgeStatusLabel(stage)} - ${BRIDGE_STAGE_STATUS_TEXT[stageStatus]}`}
              className={`flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold leading-none text-white ${BRIDGE_STAGE_DOT_CLASSES[stageStatus]}`}
            >
              <span aria-hidden="true">{BRIDGE_STAGE_ICONS[stageStatus]}</span>
            </span>
            {i < BRIDGE_PIPELINE_STAGES.length - 1 && <span aria-hidden="true" className="h-px w-2 bg-slate-700" />}
          </li>
        )
      })}
    </ol>
  )
}
