import type { BridgeChain } from '@/src/types/bridge'
import { BRIDGE_CHAINS } from '@/src/types/bridge'

export interface BridgeChainMeta {
  id: BridgeChain
  name: string
  explorerTxUrl: (txHash: string) => string
}

export const BRIDGE_CHAIN_META: Record<BridgeChain, BridgeChainMeta> = {
  ethereum: {
    id: 'ethereum',
    name: 'Ethereum',
    explorerTxUrl: (txHash) => `https://etherscan.io/tx/${txHash}`,
  },
  polygon: {
    id: 'polygon',
    name: 'Polygon',
    explorerTxUrl: (txHash) => `https://polygonscan.com/tx/${txHash}`,
  },
  arbitrum: {
    id: 'arbitrum',
    name: 'Arbitrum',
    explorerTxUrl: (txHash) => `https://arbiscan.io/tx/${txHash}`,
  },
  optimism: {
    id: 'optimism',
    name: 'Optimism',
    explorerTxUrl: (txHash) => `https://optimistic.etherscan.io/tx/${txHash}`,
  },
  base: {
    id: 'base',
    name: 'Base',
    explorerTxUrl: (txHash) => `https://basescan.org/tx/${txHash}`,
  },
}

export function bridgeChainName(chain: BridgeChain): string {
  return BRIDGE_CHAIN_META[chain].name
}

/** Historical per-route completion time range, in seconds, used to derive the EstimatedCompletion progress bar. Placeholder data - see assumption list in the PR description. */
export const BRIDGE_ROUTE_ESTIMATE_SECONDS: Partial<Record<`${BridgeChain}-${BridgeChain}`, { min: number; max: number }>> = {
  'ethereum-polygon': { min: 180, max: 900 },
  'polygon-ethereum': { min: 600, max: 2700 },
  'ethereum-arbitrum': { min: 60, max: 600 },
  'arbitrum-ethereum': { min: 420, max: 2400 },
  'ethereum-optimism': { min: 60, max: 600 },
  'optimism-ethereum': { min: 420, max: 2400 },
  'ethereum-base': { min: 60, max: 600 },
  'base-ethereum': { min: 420, max: 2400 },
  'polygon-arbitrum': { min: 240, max: 1200 },
  'arbitrum-polygon': { min: 240, max: 1200 },
}

export function getBridgeRouteEstimateSeconds(
  sourceChain: BridgeChain,
  destChain: BridgeChain,
): { min: number; max: number } | null {
  return BRIDGE_ROUTE_ESTIMATE_SECONDS[`${sourceChain}-${destChain}`] ?? null
}

export { BRIDGE_CHAINS }
