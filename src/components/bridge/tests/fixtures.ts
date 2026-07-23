import type { BridgeTransaction } from '@/src/types/bridge'

export function makeBridgeTx(overrides: Partial<BridgeTransaction> = {}): BridgeTransaction {
  return {
    id: 'tx-1',
    sourceChain: 'ethereum',
    destChain: 'polygon',
    status: 'bridge_in_progress',
    tokenSymbol: 'USDC',
    amount: '100',
    initiatedAt: '2026-07-18T00:00:00.000Z',
    completedAt: null,
    sourceTxHash: '0xabc',
    destTxHash: null,
    sourceConfirmations: 5,
    requiredSourceConfirmations: 12,
    destConfirmations: 0,
    requiredDestConfirmations: 6,
    failureReason: null,
    sourceGasUsed: '21000',
    estimatedDestGas: '150000',
    destGasUsed: null,
    usdCost: 1.5,
    ...overrides,
  }
}
