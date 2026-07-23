'use client'

// Risk analysis hook for correlated slashing.
//
// 1. Accepts a list of node configs (with optional self-reported geo/IP/region).
// 2. Resolves infra metadata via infrastructureService (demo or production).
// 3. Posts to riskClusterWorker for off-thread DBSCAN + risk scoring.
// 4. Falls back to main-thread analysis when workers are unavailable.
// 5. Persists results to useRiskStore.

import { useEffect, useRef, useState } from 'react'
import { useRiskStore, type ClusterRiskResult, type RiskNode } from '@/src/store/riskSlice'
import {
  createDemoInfrastructureService,
  type NodeConfig,
  type NodeInfraMetadata,
} from '@/src/services/infrastructureService'
import { dbscan, DBSCAN_EPSILON_KM, DBSCAN_MIN_PTS, type GeoPoint } from '@/src/utils/dbscan'
import { computeRiskScore, sharedCount, riskTier } from '@/src/utils/riskScore'
import { generateMitigationReport, ipToSubnet } from '@/src/utils/mitigationRecommender'
import type { RiskClusterRequest, RiskClusterResponse, RiskClusterError } from '@/src/workers/riskClusterWorker'

const REFRESH_INTERVAL_MS = 60_000

/** Create the cluster worker (returns null in environments without Worker). */
function createWorker(): Worker | null {
  try {
    return new Worker(new URL('../workers/riskClusterWorker.ts', import.meta.url))
  } catch {
    return null
  }
}

/** Main-thread fallback: synchronous DBSCAN + risk scoring. */
function analyseOnMainThread(
  nodes: NodeInfraMetadata[],
): { riskNodes: RiskNode[]; clusters: ClusterRiskResult[] } {
  const geoPoints: GeoPoint[] = nodes.map((n, i) => ({ index: i, lat: n.lat, lng: n.lng }))
  const labels = dbscan(geoPoints, DBSCAN_EPSILON_KM, DBSCAN_MIN_PTS)

  const riskNodes: RiskNode[] = nodes.map((n, i) => ({ ...n, clusterId: labels[i] }))

  const clusterMap = new Map<number, number[]>()
  for (let i = 0; i < labels.length; i++) {
    const cid = labels[i]
    if (cid < 0) continue
    const arr = clusterMap.get(cid)
    if (arr) arr.push(i)
    else clusterMap.set(cid, [i])
  }

  const clusters: ClusterRiskResult[] = []
  for (const [clusterId, indices] of clusterMap) {
    const members = indices.map((i) => nodes[i])
    const totalNodes = members.length
    const ips = members.map((m) => (m.ip ? ipToSubnet(m.ip) : null))
    const asns = members.map((m) => m.asn)
    const cloudRegions = members.map((m) => m.cloudRegion)

    const sharedIpCount = sharedCount(ips)
    const sharedAsnCount = sharedCount(asns)
    const sharedCloudRegionCount = sharedCount(cloudRegions)

    const riskScore = computeRiskScore({ sharedIpCount, sharedAsnCount, sharedCloudRegionCount, totalNodes })
    const tier = riskTier(riskScore)
    const report = generateMitigationReport(clusterId, riskScore, tier, members.map((m) => m.ip), asns, cloudRegions)

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
  clusters.sort((a, b) => b.riskScore - a.riskScore)
  return { riskNodes, clusters }
}

export interface UseCorrelationRiskOptions {
  /** Beacon node URL; omit to use demo data. */
  beaconNodeUrl?: string
  /** Override for polling interval (ms). Defaults to 60 s. */
  refreshIntervalMs?: number
}

export interface CorrelationRiskState {
  nodes: RiskNode[]
  clusters: ClusterRiskResult[]
  status: 'idle' | 'running' | 'complete' | 'error'
  error: string | null
  lastAnalysedAt: number | null
  /** Manually trigger a re-analysis. */
  refresh: () => void
}

/**
 * Hook that orchestrates infra metadata resolution and risk cluster analysis.
 * Accepts node configs, periodically re-analyses, and exposes results from
 * the shared Zustand risk store.
 */
export function useCorrelationRisk(
  nodeConfigs: NodeConfig[],
  options: UseCorrelationRiskOptions = {},
): CorrelationRiskState {
  const { refreshIntervalMs = REFRESH_INTERVAL_MS } = options

  const setStatus = useRiskStore((s) => s.setStatus)
  const setResults = useRiskStore((s) => s.setResults)
  const nodes = useRiskStore((s) => s.nodes)
  const clusters = useRiskStore((s) => s.clusters)
  const status = useRiskStore((s) => s.status)
  const error = useRiskStore((s) => s.error)
  const lastAnalysedAt = useRiskStore((s) => s.lastAnalysedAt)

  const workerRef = useRef<Worker | null>(null)
  const requestIdRef = useRef(0)
  const pendingRef = useRef<string | null>(null)
  const [refreshTick, setRefreshTick] = useState(0)

  // Stable key to detect config changes.
  const configKey = nodeConfigs.map((c) => c.nodeId).sort().join(',')

  // Worker lifecycle.
  useEffect(() => {
    const worker = createWorker()
    workerRef.current = worker

    const handler = (e: MessageEvent<RiskClusterResponse | RiskClusterError>) => {
      const msg = e.data
      if (msg.payload.requestId !== pendingRef.current) return
      if (msg.type === 'RESULT') {
        setResults(msg.payload.nodes, msg.payload.clusters)
      } else if (msg.type === 'ERROR') {
        setStatus('error', msg.payload.message)
      }
    }
    worker?.addEventListener('message', handler)
    return () => {
      worker?.removeEventListener('message', handler)
      worker?.terminate()
    }
  }, [setResults, setStatus])

  // Main analysis effect.
  useEffect(() => {
    if (nodeConfigs.length === 0) return

    let cancelled = false

    const run = async () => {
      setStatus('running')
      try {
        const service = createDemoInfrastructureService()
        const infraNodes = await service.fetchNodeMetadata(nodeConfigs)
        if (cancelled) return

        const worker = workerRef.current
        if (worker) {
          const requestId = `risk-${++requestIdRef.current}`
          pendingRef.current = requestId
          const req: RiskClusterRequest = {
            type: 'ANALYSE',
            payload: { requestId, nodes: infraNodes },
          }
          worker.postMessage(req)
          // Worker response handled in the handler above.
          return
        }

        // Main-thread fallback.
        const { riskNodes, clusters: computed } = analyseOnMainThread(infraNodes)
        if (!cancelled) setResults(riskNodes, computed)
      } catch (err) {
        if (!cancelled) {
          setStatus('error', err instanceof Error ? err.message : 'Analysis failed')
        }
      }
    }

    run()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configKey, refreshTick, setStatus, setResults])

  // Periodic refresh.
  useEffect(() => {
    if (refreshIntervalMs <= 0) return
    const id = window.setInterval(() => setRefreshTick((t) => t + 1), refreshIntervalMs)
    return () => window.clearInterval(id)
  }, [refreshIntervalMs])

  return {
    nodes,
    clusters,
    status: status as CorrelationRiskState['status'],
    error,
    lastAnalysedAt,
    refresh: () => setRefreshTick((t) => t + 1),
  }
}
