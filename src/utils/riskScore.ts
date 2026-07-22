// Correlated slashing risk score computation.
//
// Formula (from issue spec):
//   score = 0.4 × (shared_IP_count / total_nodes)
//          + 0.3 × (shared_ASN_count / total_nodes)
//          + 0.3 × (shared_cloud_region_count / total_nodes)
//
// "shared_X_count" = nodes whose X value appears more than once in the cluster.
// Score is bounded to [0, 1].

export type RiskTier = 'low' | 'medium' | 'high' | 'critical'

export const RISK_TIER_THRESHOLDS: Record<RiskTier, [number, number]> = {
  low: [0, 0.25],
  medium: [0.25, 0.5],
  high: [0.5, 0.75],
  critical: [0.75, 1.0001], // upper-open; catches exactly 1.0
}

/** Determine the risk tier for a given score. */
export function riskTier(score: number): RiskTier {
  if (score >= 0.75) return 'critical'
  if (score >= 0.5) return 'high'
  if (score >= 0.25) return 'medium'
  return 'low'
}

export interface RiskFactors {
  /** IP subnet prefix (/24) or full IP string that are shared by >1 node. */
  sharedIpCount: number
  /** Nodes sharing a common ASN with at least one other node in the cluster. */
  sharedAsnCount: number
  /** Nodes sharing a cloud region with at least one other node in the cluster. */
  sharedCloudRegionCount: number
  totalNodes: number
}

/**
 * Compute the weighted correlated slashing risk score for a cluster.
 * Returns a value in [0, 1].
 */
export function computeRiskScore(factors: RiskFactors): number {
  const { sharedIpCount, sharedAsnCount, sharedCloudRegionCount, totalNodes } = factors
  if (totalNodes === 0) return 0
  const score =
    0.4 * (sharedIpCount / totalNodes) +
    0.3 * (sharedAsnCount / totalNodes) +
    0.3 * (sharedCloudRegionCount / totalNodes)
  return Math.min(1, Math.max(0, score))
}

/**
 * Given a list of values (IP / ASN / region per node), return the count of
 * nodes whose value is shared with at least one other node in the cluster.
 * Nodes with a null/undefined value are treated as unique (not shared).
 */
export function sharedCount(values: Array<string | null | undefined>): number {
  const freq = new Map<string, number>()
  for (const v of values) {
    if (v == null) continue
    freq.set(v, (freq.get(v) ?? 0) + 1)
  }
  let count = 0
  for (const v of values) {
    if (v != null && (freq.get(v) ?? 0) > 1) count++
  }
  return count
}
