// Validator balance & reconciliation type definitions.
//
// All on-chain amounts are held as bigint gwei to avoid float drift; display
// formatting to ETH happens at the edge (see utils/balanceMath).

/**
 * A raw balance observation for a validator at an epoch boundary. Effective
 * balance updates only at epoch boundaries, so one sample per epoch suffices.
 * `withdrawalGwei` is the amount swept out this epoch (0 when none).
 */
export interface ValidatorBalanceSample {
  validatorIndex: number
  epoch: number
  /** Unix-ms timestamp of the epoch boundary. */
  timestamp: number
  /** Actual on-chain balance in gwei. */
  actualBalanceGwei: bigint
  /** Amount partial-withdrawn (swept) this epoch, in gwei. */
  withdrawalGwei: bigint
}

/**
 * The decomposition of one epoch's balance change relative to the previous
 * sample. The net actual-balance delta is split into its consensus-layer
 * reward, penalty, and withdrawal-credit components:
 *
 *   gross_delta   = actual_n - actual_{n-1} + withdrawal_n
 *   rewards       = max(0, gross_delta)
 *   penalties     = max(0, -gross_delta)
 *   withdrawal    = withdrawal_n
 */
export interface ReconciliationRecord {
  validatorIndex: number
  epoch: number
  timestamp: number
  actualBalanceGwei: bigint
  effectiveBalanceGwei: bigint
  /** actual_n - actual_{n-1} (negative if balance fell). */
  netDeltaGwei: bigint
  rewardsGwei: bigint
  penaltiesGwei: bigint
  withdrawalCreditsGwei: bigint
  /** True when actual balance exceeds the effective-balance cap. */
  capped: boolean
}

/** Aggregate reconciliation summary for a validator over its tracked history. */
export interface ReconciliationSummary {
  validatorIndex: number
  latest: ReconciliationRecord | null
  totalRewardsGwei: bigint
  totalPenaltiesGwei: bigint
  totalWithdrawalsGwei: bigint
  recordCount: number
}

/** Projected unlock estimate for a capped validator. */
export interface UnlockProjection {
  validatorIndex: number
  /** Whether the validator is currently capped (excess above the cap). */
  capped: boolean
  excessGwei: bigint
  /** Trailing-average reward rate in gwei/day used for the projection. */
  avgDailyRewardGwei: bigint
  /** Central ETA in days; null when not capped or no positive reward rate. */
  etaDays: number | null
  /** ±15% error bounds around `etaDays`. */
  etaDaysLow: number | null
  etaDaysHigh: number | null
  /** Projected unlock timestamps (unix-ms); null when not projectable. */
  unlockDate: number | null
  unlockDateLow: number | null
  unlockDateHigh: number | null
}
