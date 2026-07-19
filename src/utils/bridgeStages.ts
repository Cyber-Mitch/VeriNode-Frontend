import { BRIDGE_PIPELINE_STAGES, isBridgeFailureStatus, type BridgeTxStatus } from '@/src/types/bridge'

export type BridgeStageStatus = 'done' | 'current' | 'upcoming' | 'failed'

// Both failure states are modeled as having completed source confirmation and
// then stalling during the bridge relay leg - funds have left the source
// chain but the API does not report a more granular failure stage than
// "gas failure" / "stuck deposit", both of which occur once funds are in
// transit. Documented assumption (see #95 PR description).
const FAILURE_STAGE_INDEX = BRIDGE_PIPELINE_STAGES.indexOf('bridge_in_progress')

export function getStageStatuses(status: BridgeTxStatus): BridgeStageStatus[] {
  if (isBridgeFailureStatus(status)) {
    return BRIDGE_PIPELINE_STAGES.map((_, i) =>
      i < FAILURE_STAGE_INDEX ? 'done' : i === FAILURE_STAGE_INDEX ? 'failed' : 'upcoming',
    )
  }
  const currentIndex = BRIDGE_PIPELINE_STAGES.indexOf(status)
  return BRIDGE_PIPELINE_STAGES.map((_, i) => (i < currentIndex ? 'done' : i === currentIndex ? 'current' : 'upcoming'))
}

export const BRIDGE_STAGE_DOT_CLASSES: Record<BridgeStageStatus, string> = {
  done: 'bg-emerald-500',
  current: 'bg-sky-500',
  upcoming: 'bg-slate-700',
  failed: 'bg-red-500',
}

/** Icon glyphs so stage state is never conveyed by color alone. */
export const BRIDGE_STAGE_ICONS: Record<BridgeStageStatus, string> = {
  done: '✓',
  current: '●',
  upcoming: '○',
  failed: '✕',
}

export const BRIDGE_STAGE_STATUS_TEXT: Record<BridgeStageStatus, string> = {
  done: 'done',
  current: 'in progress',
  upcoming: 'pending',
  failed: 'failed',
}
