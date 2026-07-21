'use client'

import { useEffect, useRef, useState } from 'react'
import { dvtService, getClusterQuorum, getDVTHealthTier, type DVTHealthTier } from '@/src/services/dvtService'
import { calculateLatencyPercentiles, type ConsensusLatencyPercentiles } from '@/src/utils/percentileCalculator'
import { useDVTStore } from '@/src/store/dvtSlice'

const REFRESH_INTERVAL_MS = 30_000
const RING_BUFFER_LIMIT = 1_000
const MAX_CLUSTERS = 50

export type DVTNodeClusterHealth = {
  nodeId: string
  operatorName: string
  isParticipating: boolean
  participationRate: number
  successfulSignings: number
  totalSigningRounds: number
  latencyPercentiles: ConsensusLatencyPercentiles
}

export type DVTClusterHealth = {
  id: string
  name: string
  totalNodes: number
  participatingNodes: number
  quorum: number
  healthTier: DVTHealthTier
  latencyPercentiles: ConsensusLatencyPercentiles
  nodes: DVTNodeClusterHealth[]
  updatedAt: string
}

function trimToRingBuffer(values: number[]): number[] {
  return values.slice(Math.max(0, values.length - RING_BUFFER_LIMIT))
}

export function useDVTClusterHealth() {
  const { clusters, lastUpdated, setClusters } = useDVTStore()
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const latencyHistoryRef = useRef<Record<string, number[]>>({})

  useEffect(() => {
    let isMounted = true
    async function loadClusterHealth() {
      try {
        setError(null)
        const clusterSummaries = (await dvtService.getClusters()).slice(0, MAX_CLUSTERS)
        const healthResponses = await Promise.all(clusterSummaries.map((cluster) => dvtService.getClusterHealth(cluster.id)))

        const nextClusters = healthResponses.map((cluster) => {
          const nodes = cluster.nodes.map((node) => {
            const key = `${cluster.id}:${node.nodeId}`
            const history = trimToRingBuffer([...(latencyHistoryRef.current[key] ?? []), ...node.consensusRoundTripLatenciesMs])
            latencyHistoryRef.current[key] = history

            return {
              nodeId: node.nodeId,
              operatorName: node.operatorName,
              isParticipating: node.isParticipating,
              participationRate: node.totalSigningRounds > 0 ? node.successfulSignings / node.totalSigningRounds : 0,
              successfulSignings: node.successfulSignings,
              totalSigningRounds: node.totalSigningRounds,
              latencyPercentiles: calculateLatencyPercentiles(history),
            }
          })

          const clusterLatencies = nodes.flatMap((node) => latencyHistoryRef.current[`${cluster.id}:${node.nodeId}`] ?? [])
          const latencyPercentiles = calculateLatencyPercentiles(clusterLatencies)
          const quorum = getClusterQuorum(cluster.totalNodes)

          return {
            id: cluster.id,
            name: cluster.name,
            totalNodes: cluster.totalNodes,
            participatingNodes: cluster.participatingNodes,
            quorum,
            healthTier: getDVTHealthTier(cluster.totalNodes, cluster.participatingNodes, latencyPercentiles.p99),
            latencyPercentiles,
            nodes,
            updatedAt: cluster.updatedAt,
          }
        })

        if (isMounted) setClusters(nextClusters)
      } catch (caughtError) {
        if (isMounted) setError(caughtError instanceof Error ? caughtError.message : 'Unable to load DVT cluster health')
      } finally {
        if (isMounted) setIsLoading(false)
      }
    }

    loadClusterHealth()
    const intervalId = setInterval(loadClusterHealth, REFRESH_INTERVAL_MS)

    return () => {
      isMounted = false
      clearInterval(intervalId)
    }
  }, [setClusters])

  return { clusters, lastUpdated, isLoading, error }
}
