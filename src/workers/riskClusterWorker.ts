// Web worker for DBSCAN clustering and risk score computation.
//
// Accepts a list of NodeInfraMetadata objects, runs DBSCAN on the lat/lng
// coordinates (ε=500 km, minPts=3), then computes the weighted slashing risk
// score and mitigation recommendations for every detected cluster.
//
// Worker message protocol:
//   Request  → { type: 'ANALYSE'; payload: { requestId: string; nodes: NodeInfraMetadata[] } }
//   Response → { type: 'RESULT';  payload: { requestId: string; nodes: RiskNode[]; clusters: ClusterRiskResult[] } }
//            | { type: 'ERROR';   payload: { requestId: string; message: string } }

import {
  dbscan,
  DBSCAN_EPSILON_KM,
  DBSCAN_MIN_PTS,
  type GeoPoint,
} from '@/src/utils/dbscan'
import { computeRiskScore, sharedCount, riskTier } from '@/src/utils/riskScore'
import { generateMitigationReport, ipToSubnet } from '@/src/utils/mitigationRecommender'
import type { NodeInfraMetadata } from '@/src/services/infrastructureService'
import type { RiskNode, ClusterRiskResult } from '@/src/store/riskSlice'

// ── Message types ─────────────────────────────────────────────────────────────

export interface RiskClusterRequest {
  type: 'ANALYSE'
  payload: {
    requestId: string
    nodes: NodeInfraMetadata[]
  }
}

export interface RiskClusterResponse {
  type: 'RESULT'
  payload: {
    requestId: string
    nodes: RiskNode[]
    clusters: ClusterRiskResult[]
  }
}

export interface RiskClusterError {
  type: 'ERROR'
  payload: {
    requestId: string
    message: string
  }
}

function post(msg: RiskClusterResponse | RiskClusterError): void {
  ;(self as unknown as Worker).postMessage(msg)
}

// ── Core analysis ─────────────────────────────────────────────────────────────

function analyse(
  nodes: NodeInfraMetadata[],
): { riskNodes: RiskNode[]; clusters: ClusterRiskResult[] } {
  // 1. Build geo-points for DBSCAN.
  const geoPoints: GeoPoint[] = nodes.map((n, i) => ({
    index: i,
    lat: n.lat,
    lng: n.lng,
  }))

  // 2. Cluster.
  const labels = dbscan(geoPoints, DBSCAN_EPSILON_KM, DBSCAN_MIN_PTS)

  // 3. Annotate nodes.
  const riskNodes: RiskNode[] = nodes.map((n, i) => ({
    ...n,
    clusterId: labels[i],
  }))

  // 4. Group nodes by cluster (skip noise = -1).
  const clusterMap = new Map<number, number[]>()
  for (let i = 0; i < labels.length; i++) {
    const cid = labels[i]
    if (cid < 0) continue
    const arr = clusterMap.get(cid)
    if (arr) arr.push(i)
    else clusterMap.set(cid, [i])
  }

  // 5. Compute risk scores & mitigations per cluster.
  const clusters: ClusterRiskResult[] = []
  for (const [clusterId, indices] of clusterMap) {
    const members = indices.map((i) => nodes[i])
    const totalNodes = members.length

    // Normalise IP subnets so /24 sharing is detected.
    const ips = members.map((m) => (m.ip ? ipToSubnet(m.ip) : null))
    const asns = members.map((m) => m.asn)
    const cloudRegions = members.map((m) => m.cloudRegion)

    const sharedIpCount = sharedCount(ips)
    const sharedAsnCount = sharedCount(asns)
    const sharedCloudRegionCount = sharedCount(cloudRegions)

    const riskScore = computeRiskScore({
      sharedIpCount,
      sharedAsnCount,
      sharedCloudRegionCount,
      totalNodes,
    })
    const tier = riskTier(riskScore)

    const report = generateMitigationReport(
      clusterId,
      riskScore,
      tier,
      members.map((m) => m.ip),
      asns,
      cloudRegions,
    )

    clusters.push({
      clusterId,
      nodeIds: members.map((m) => m.nodeId),
      nodeCount: totalNodes,
      riskScore,
      tier,
      sharedIpCount,
      sharedAsnCount,
      sharedCloudRegionCount,
      recommendations: report.recommendations,
    })
  }

  // Sort clusters by descending risk score.
  clusters.sort((a, b) => b.riskScore - a.riskScore)

  return { riskNodes, clusters }
}

// ── Message handler ───────────────────────────────────────────────────────────

self.onmessage = (e: MessageEvent<RiskClusterRequest>) => {
  const msg = e.data
  if (msg.type !== 'ANALYSE') return

  const { requestId, nodes } = msg.payload
  try {
    const { riskNodes, clusters } = analyse(nodes)
    post({ type: 'RESULT', payload: { requestId, nodes: riskNodes, clusters } })
  } catch (err) {
    post({
      type: 'ERROR',
      payload: {
        requestId,
        message: err instanceof Error ? err.message : 'Unknown worker error',
      },
    })
  }
}

export {}
