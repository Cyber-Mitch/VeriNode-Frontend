// Mitigation recommendation engine for correlated slashing risk.
//
// For each risk factor (IP subnet, ASN, cloud region) it generates human-
// readable diversification suggestions based on the count of affected nodes
// and the specific shared values detected in a cluster.

import type { RiskTier } from '@/src/utils/riskScore'

export interface MitigationRecommendation {
  /** Short machine-readable key for the risk factor. */
  factor: 'ip_subnet' | 'asn' | 'cloud_region'
  /** Human-readable title. */
  title: string
  /** Full recommendation text. */
  detail: string
  /** Number of nodes affected by this factor. */
  affectedNodes: number
  /** The shared value (e.g. "AS15169", "us-east-1"). */
  sharedValue: string
}

export interface ClusterMitigationReport {
  clusterId: number
  riskScore: number
  tier: RiskTier
  recommendations: MitigationRecommendation[]
}

/** IP addresses → /24 subnet prefix (e.g. "203.0.113.5" → "203.0.113"). */
export function ipToSubnet(ip: string): string {
  const parts = ip.split('.')
  if (parts.length === 4) return parts.slice(0, 3).join('.')
  // IPv6 or unexpected: return as-is
  return ip
}

/**
 * Generate mitigation recommendations for a cluster.
 *
 * @param clusterId  Numeric cluster identifier
 * @param riskScore  Pre-computed risk score [0,1]
 * @param tier       Pre-computed risk tier
 * @param ips        Per-node IP strings (null = unknown)
 * @param asns       Per-node ASN strings like "AS12345" (null = unknown)
 * @param cloudRegions  Per-node cloud region strings like "us-east-1" (null = unknown)
 */
export function generateMitigationReport(
  clusterId: number,
  riskScore: number,
  tier: RiskTier,
  ips: Array<string | null>,
  asns: Array<string | null>,
  cloudRegions: Array<string | null>,
): ClusterMitigationReport {
  const recommendations: MitigationRecommendation[] = []

  // ── IP subnet analysis ────────────────────────────────────────────────────
  const subnetFreq = new Map<string, number>()
  for (const ip of ips) {
    if (ip == null) continue
    const subnet = ipToSubnet(ip)
    subnetFreq.set(subnet, (subnetFreq.get(subnet) ?? 0) + 1)
  }
  for (const [subnet, count] of subnetFreq) {
    if (count > 1) {
      recommendations.push({
        factor: 'ip_subnet',
        title: 'Diversify IP subnets',
        detail: `${count} node${count !== 1 ? 's' : ''} share the ${subnet}.0/24 subnet. ` +
          `Move ${count - 1} node${count - 1 !== 1 ? 's' : ''} to a different network ` +
          `provider or subnet to eliminate correlated network-layer failures.`,
        affectedNodes: count,
        sharedValue: `${subnet}.0/24`,
      })
    }
  }

  // ── ASN analysis ──────────────────────────────────────────────────────────
  const asnFreq = new Map<string, number>()
  for (const asn of asns) {
    if (asn == null) continue
    asnFreq.set(asn, (asnFreq.get(asn) ?? 0) + 1)
  }
  for (const [asn, count] of asnFreq) {
    if (count > 1) {
      recommendations.push({
        factor: 'asn',
        title: 'Diversify autonomous systems',
        detail: `${count} node${count !== 1 ? 's' : ''} are on ${asn}. ` +
          `Move ${count - 1} node${count - 1 !== 1 ? 's' : ''} to a different ISP or ` +
          `autonomous system to avoid BGP-level correlated outages.`,
        affectedNodes: count,
        sharedValue: asn,
      })
    }
  }

  // ── Cloud region analysis ─────────────────────────────────────────────────
  const regionFreq = new Map<string, number>()
  for (const region of cloudRegions) {
    if (region == null) continue
    regionFreq.set(region, (regionFreq.get(region) ?? 0) + 1)
  }
  for (const [region, count] of regionFreq) {
    if (count > 1) {
      recommendations.push({
        factor: 'cloud_region',
        title: 'Diversify cloud regions',
        detail: `${count} node${count !== 1 ? 's' : ''} are deployed in ${region}. ` +
          `Move ${count - 1} node${count - 1 !== 1 ? 's' : ''} to a different cloud region ` +
          `or provider to eliminate single-AZ failure correlation.`,
        affectedNodes: count,
        sharedValue: region,
      })
    }
  }

  // Sort by most-affected first.
  recommendations.sort((a, b) => b.affectedNodes - a.affectedNodes)

  return { clusterId, riskScore, tier, recommendations }
}
