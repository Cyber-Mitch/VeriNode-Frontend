export type FinalityCheckpointInput = {
  slot: number
  finalizedEpoch: number
  justifiedEpoch: number
  participationRate: number
}

export type FinalityHealthSnapshot = FinalityCheckpointInput & {
  score: number
  color: 'green' | 'yellow' | 'red'
  stalledSlots: number
  timestamp: number
}

export type FinalityScoreState = {
  lastFinalizedEpoch: number | null
  stalledSlots: number
}

const FINALIZED_WEIGHT = 0.4
const JUSTIFIED_WEIGHT = 0.35
const PARTICIPATION_WEIGHT = 0.25
const STALL_THRESHOLD_SLOTS = 4
const STALL_DECAY_SLOTS = 32

function clamp(value: number, min = 0, max = 100): number {
  return Math.min(max, Math.max(min, value))
}

export function getFinalityHealthColor(score: number): FinalityHealthSnapshot['color'] {
  if (score >= 80) return 'green'
  if (score >= 50) return 'yellow'
  return 'red'
}

export function calculateFinalityHealthScore(
  input: FinalityCheckpointInput,
  previous: FinalityScoreState = { lastFinalizedEpoch: null, stalledSlots: 0 },
): { snapshot: FinalityHealthSnapshot; state: FinalityScoreState } {
  const advanced = previous.lastFinalizedEpoch === null || input.finalizedEpoch > previous.lastFinalizedEpoch
  const stalledSlots = advanced ? 0 : previous.stalledSlots + 1
  const finalizedProgress = advanced ? 100 : stalledSlots < STALL_THRESHOLD_SLOTS ? 100 : clamp(100 - ((stalledSlots - STALL_THRESHOLD_SLOTS + 1) / STALL_DECAY_SLOTS) * 100)
  const justifiedRatio = input.finalizedEpoch <= 0 ? 100 : clamp((input.justifiedEpoch / input.finalizedEpoch) * 100)
  const participation = clamp(input.participationRate <= 1 ? input.participationRate * 100 : input.participationRate)
  const score = clamp((FINALIZED_WEIGHT * finalizedProgress) + (JUSTIFIED_WEIGHT * justifiedRatio) + (PARTICIPATION_WEIGHT * participation))

  const snapshot: FinalityHealthSnapshot = {
    ...input,
    participationRate: participation,
    score: Math.round(score),
    color: getFinalityHealthColor(score),
    stalledSlots,
    timestamp: Date.now(),
  }

  return {
    snapshot,
    state: { lastFinalizedEpoch: input.finalizedEpoch, stalledSlots },
  }
}
