import { offlineStorage } from '@/src/services/localCache'

export type DVTHealthTier = 'healthy' | 'degraded' | 'critical'

export type DVTNodeHealth = {
  nodeId: string
  operatorName: string
  isParticipating: boolean
  successfulSignings: number
  totalSigningRounds: number
  consensusRoundTripLatenciesMs: number[]
}

export type DVTCluster = {
  id: string
  name: string
  totalNodes: number
}

export type DVTClusterHealthResponse = DVTCluster & {
  participatingNodes: number
  nodes: DVTNodeHealth[]
  updatedAt: string
}

const API_BASE_URL = process.env.NEXT_PUBLIC_DVT_API_URL ?? ''
const CACHE_TTL_MINUTES = 5

async function requestDVT<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, { headers: { Accept: 'application/json' } })
  if (!response.ok) {
    throw new Error(`DVT API request failed (${response.status}) for ${path}`)
  }
  return response.json() as Promise<T>
}

async function getCachedOrFetch<T>(cacheKey: string, path: string): Promise<T> {
  if (typeof window !== 'undefined') {
    const cached = await offlineStorage.getCached(cacheKey)
    if (cached) return cached.data as T
  }

  const data = await requestDVT<T>(path)

  if (typeof window !== 'undefined') {
    await offlineStorage.setCached(cacheKey, data, CACHE_TTL_MINUTES)
  }

  return data
}

export const dvtService = {
  async getClusters(): Promise<DVTCluster[]> {
    return getCachedOrFetch<DVTCluster[]>('dvt:clusters', '/clusters')
  },

  async getClusterHealth(clusterId: string): Promise<DVTClusterHealthResponse> {
    return getCachedOrFetch<DVTClusterHealthResponse>(`dvt:cluster:${clusterId}:health`, `/clusters/${clusterId}/health`)
  },
}

export function getClusterQuorum(totalNodes: number): number {
  return Math.ceil((2 / 3) * totalNodes)
}

export function getDVTHealthTier(totalNodes: number, participatingNodes: number, p99LatencyMs: number): DVTHealthTier {
  if (participatingNodes < getClusterQuorum(totalNodes)) return 'critical'
  return p99LatencyMs >= 2000 ? 'degraded' : 'healthy'
}
