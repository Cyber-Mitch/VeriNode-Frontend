// Concentration-risk detection for shard assignments.
//
// Spreading an operator's validators across shards limits correlated exposure.
// When more than CONCENTRATION_THRESHOLD (20%) of the operator's validators
// land on a single shard in an epoch, we flag concentration risk.

import {
  CONCENTRATION_THRESHOLD,
  type CommitteeAssignment,
  type ConcentrationResult,
  type ShardShare,
} from '@/src/types/committee'

/**
 * Compute per-shard shares and flag risk when any shard exceeds the threshold.
 */
export function computeConcentration(
  assignments: CommitteeAssignment[],
  threshold = CONCENTRATION_THRESHOLD,
): ConcentrationResult {
  const total = assignments.length
  if (total === 0) {
    return { total: 0, perShard: [], maxShare: 0, topShard: null, atRisk: false }
  }

  const counts = new Map<number, number>()
  for (const a of assignments) {
    counts.set(a.shard, (counts.get(a.shard) ?? 0) + 1)
  }

  const perShard: ShardShare[] = [...counts.entries()]
    .map(([shard, count]) => ({ shard, count, share: count / total }))
    .sort((a, b) => b.share - a.share || a.shard - b.shard)

  const top = perShard[0]
  return {
    total,
    perShard,
    maxShare: top.share,
    topShard: top.shard,
    atRisk: top.share > threshold,
  }
}
