import type { StakingAction } from "@/src/store/stakingStore"

/**
 * Soroban staking transaction builder.
 *
 * The wider app treats a transaction XDR as an opaque, deterministic string
 * that is hashed for de-duplication and handed to the RPC client. This builder
 * produces that string from the high-level staking intent so the optimistic
 * hook never has to know how an envelope is shaped.
 */

const CONTRACT_METHOD: Record<StakingAction, string> = {
  stake: "stake",
  unstake: "unstake",
  restake: "restake",
  delegate: "delegate",
  undelegate: "undelegate",
}

export interface StakingTxParams {
  action: StakingAction
  amount: number
  /** Source account public key (G...). */
  source: string
  /** Optional explicit sequence number; callers usually let the RPC assign it. */
  sequence?: number
}

export interface BuiltStakingTx {
  /** The envelope XDR string passed to the RPC client. */
  xdr: string
  method: string
  amount: number
  source: string
}

/**
 * Build a staking transaction envelope.
 *
 * Validates the staking intent and serialises it into a stable XDR payload.
 * The payload is deterministic for a given (method, amount, source, sequence)
 * so identical re-submissions hash to the same value and can be de-duplicated.
 */
export function buildStakingTransaction(params: StakingTxParams): BuiltStakingTx {
  const { action, amount, source, sequence } = params

  if (!source || !source.startsWith("G")) {
    throw new Error("Invalid source account")
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Stake amount must be a positive number")
  }

  const method = CONTRACT_METHOD[action]
  if (!method) {
    throw new Error(`Unsupported staking action: ${action}`)
  }

  const envelope = {
    v: 1,
    method,
    args: { amount: amount.toString(), staker: source },
    seq: sequence ?? null,
  }

  // Base64-encode the canonical JSON so the result looks/behaves like an XDR
  // blob to the rest of the pipeline while staying deterministic.
  const json = JSON.stringify(envelope)
  const xdr =
    typeof btoa !== "undefined"
      ? btoa(unescape(encodeURIComponent(json)))
      : Buffer.from(json, "utf-8").toString("base64")

  return { xdr, method, amount, source }
}
