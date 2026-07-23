// Pre-flight Soroban simulation API.
//
// Calls POST /api/v1/simulate/transaction (a thin proxy over the Soroban RPC
// `simulateTransaction` method) and normalizes the response. On failure the
// caller falls back to the static, per-type estimates in feeEstimates.json.

import type { SorobanTransaction, TransactionType } from '@/src/lib/stellar/transaction'
import { transactionLabel } from '@/src/lib/stellar/transaction'
import feeEstimates from '@/src/config/feeEstimates.json'

const SIMULATE_ENDPOINT = '/api/v1/simulate/transaction'

export interface StorageFootprint {
  readOnly: string[]
  readWrite: string[]
}

export interface StateChange {
  key: string
  kind: 'created' | 'updated' | 'removed'
}

export interface OperationCost {
  type: TransactionType
  label: string
  instructions: number
  writeBytes: number
  readBytes: number
}

export interface SimulationResult {
  success: boolean
  instructions: number
  writeBytes: number
  readBytes: number
  footprint: StorageFootprint
  stateChanges: StateChange[]
  operations: OperationCost[]
  /** True when the result is a static estimate (simulation unavailable). */
  estimated: boolean
  error?: string
}

/** Wire shape returned by the simulation endpoint (mirrors RPC `cost`). */
interface SimulateWireResponse {
  success: boolean
  cost: { instructions: number; writeBytes: number; readBytes: number }
  footprint?: Partial<StorageFootprint>
  stateChanges?: StateChange[]
  operations?: Array<{
    type: TransactionType
    label?: string
    cost: { instructions: number; writeBytes: number; readBytes: number }
  }>
  error?: string
}

type FeeEstimate = { instructions: number; writeBytes: number; readBytes: number }
const ESTIMATES = feeEstimates as Record<TransactionType, FeeEstimate>

function normalize(wire: SimulateWireResponse, tx: SorobanTransaction): SimulationResult {
  const operations: OperationCost[] = (wire.operations ?? []).map((op) => ({
    type: op.type,
    label: op.label ?? transactionLabel(op.type),
    instructions: op.cost.instructions,
    writeBytes: op.cost.writeBytes,
    readBytes: op.cost.readBytes,
  }))

  return {
    success: wire.success,
    instructions: wire.cost.instructions,
    writeBytes: wire.cost.writeBytes,
    readBytes: wire.cost.readBytes,
    footprint: {
      readOnly: wire.footprint?.readOnly ?? [],
      readWrite: wire.footprint?.readWrite ?? [],
    },
    stateChanges: wire.stateChanges ?? [],
    operations:
      operations.length > 0
        ? operations
        : tx.operations.map((op) => ({
            type: op.type,
            label: op.label,
            instructions: wire.cost.instructions,
            writeBytes: wire.cost.writeBytes,
            readBytes: wire.cost.readBytes,
          })),
    estimated: false,
    error: wire.error,
  }
}

/**
 * Run a pre-flight simulation. Throws on network/HTTP/parse failure so the
 * orchestrator can apply the conservative fallback estimate.
 */
export async function simulateTransaction(tx: SorobanTransaction): Promise<SimulationResult> {
  const response = await fetch(SIMULATE_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ xdr: tx.xdr, type: tx.type }),
  })
  if (!response.ok) {
    throw new Error(`Simulation failed: HTTP ${response.status}`)
  }
  const wire = (await response.json()) as SimulateWireResponse
  return normalize(wire, tx)
}

/**
 * Conservative static estimate from feeEstimates.json, distributed evenly
 * across the transaction's operations. Flagged `estimated` so the UI can show
 * an "Estimated (simulation unavailable)" badge.
 */
export function getFallbackEstimate(tx: SorobanTransaction): SimulationResult {
  const totalOps = Math.max(1, tx.operations.length)
  const operations: OperationCost[] = tx.operations.map((op) => {
    const est = ESTIMATES[op.type]
    return {
      type: op.type,
      label: op.label,
      instructions: est.instructions,
      writeBytes: est.writeBytes,
      readBytes: est.readBytes,
    }
  })

  const sum = operations.reduce(
    (acc, op) => ({
      instructions: acc.instructions + op.instructions,
      writeBytes: acc.writeBytes + op.writeBytes,
      readBytes: acc.readBytes + op.readBytes,
    }),
    { instructions: 0, writeBytes: 0, readBytes: 0 },
  )

  // Single-op transactions read straight from the table.
  const base = totalOps === 1 ? operations[0] : sum

  return {
    success: true,
    instructions: base.instructions,
    writeBytes: base.writeBytes,
    readBytes: base.readBytes,
    footprint: { readOnly: [], readWrite: [] },
    stateChanges: [],
    operations,
    estimated: true,
  }
}
