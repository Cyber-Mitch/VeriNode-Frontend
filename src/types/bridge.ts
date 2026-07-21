// Cross-chain bridge transaction tracking (#95).
//
// Status pipeline: initiated -> source_confirmed -> bridge_in_progress ->
// dest_confirmed -> complete. A transaction can instead land in one of the
// two failure states once funds have left the source chain. Failure states
// are TERMINAL for polling purposes (nothing changes server-side without a
// user action - retry/claim - which itself triggers a fresh fetch), but they
// are NOT "done": the UI keeps surfacing them as needing attention rather
// than as a finished row.

export const BRIDGE_CHAINS = ['ethereum', 'polygon', 'arbitrum', 'optimism', 'base'] as const
export type BridgeChain = (typeof BRIDGE_CHAINS)[number]

export const BRIDGE_TX_STATUS = [
  'initiated',
  'source_confirmed',
  'bridge_in_progress',
  'dest_confirmed',
  'complete',
  'failed_gas',
  'failed_stuck_deposit',
] as const
export type BridgeTxStatus = (typeof BRIDGE_TX_STATUS)[number]

/** The five pipeline stages shown by the status stepper, in order. Failure states branch off but don't add a stage. */
export const BRIDGE_PIPELINE_STAGES = [
  'initiated',
  'source_confirmed',
  'bridge_in_progress',
  'dest_confirmed',
  'complete',
] as const satisfies readonly BridgeTxStatus[]
export type BridgePipelineStage = (typeof BRIDGE_PIPELINE_STAGES)[number]

export const TERMINAL_BRIDGE_STATUSES = [
  'complete',
  'failed_gas',
  'failed_stuck_deposit',
] as const satisfies readonly BridgeTxStatus[]

export function isTerminalBridgeStatus(status: BridgeTxStatus): boolean {
  return (TERMINAL_BRIDGE_STATUSES as readonly BridgeTxStatus[]).includes(status)
}

export function isBridgeFailureStatus(
  status: BridgeTxStatus,
): status is Extract<BridgeTxStatus, 'failed_gas' | 'failed_stuck_deposit'> {
  return status === 'failed_gas' || status === 'failed_stuck_deposit'
}

export type BridgeFailureReason =
  | { type: 'gas_failure'; message: string; suggestedGasGwei?: number }
  | { type: 'stuck_deposit'; message: string; claimableAt?: string }
  | { type: 'unknown'; message: string }

export interface BridgeTransaction {
  id: string
  sourceChain: BridgeChain
  destChain: BridgeChain
  status: BridgeTxStatus
  tokenSymbol: string
  /** Decimal string, e.g. "1.5" - avoids float drift for on-chain amounts. */
  amount: string
  initiatedAt: string
  completedAt: string | null
  sourceTxHash: string
  destTxHash: string | null
  sourceConfirmations: number
  requiredSourceConfirmations: number
  /** 0 until funds have left the source chain (bridge_in_progress or later). */
  destConfirmations: number
  requiredDestConfirmations: number
  /** null unless status is a failure state. */
  failureReason: BridgeFailureReason | null
  /** null until the source leg is confirmed. */
  sourceGasUsed: string | null
  /** Pre-execution quote, available from initiation onward. Distinct from destGasUsed (the actual amount, known only after execution). */
  estimatedDestGas: string | null
  /** null until the destination leg has actually executed. */
  destGasUsed: string | null
  /** Total cost of the transfer in USD, as supplied by the API. Never recomputed client-side. */
  usdCost: number | null
}

export interface BridgeTransactionListResponse {
  transactions: BridgeTransaction[]
  total: number
  page: number
  pageSize: number
}
