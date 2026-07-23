// Validator reward history types for issue #102.
//
// Daily reward amounts are stored as numbers (ETH) for chart-friendliness.
// Source breakdown mirrors the Ethereum consensus-layer sources: block
// proposals, attestations, and sync committee duties.

/** Source of a validator reward for a given day/epoch. */
export type RewardSource = 'proposal' | 'attestation' | 'sync'

/** A single daily reward record returned by the rewards API. */
export interface DailyReward {
  /** ISO-8601 date string, e.g. "2024-01-15". */
  date: string
  /** Unix-ms timestamp for the start of the day. */
  timestamp: number
  /** Total reward for the day in ETH. */
  totalEth: number
  /** Breakdown by source (ETH per source). */
  breakdown: Record<RewardSource, number>
  /** Epoch at which the reward was earned. */
  epoch: number
  /** Block number (for proposals; 0 if not applicable). */
  blockNumber: number
  /** Transaction hash for on-chain lookup (may be empty string). */
  txHash: string
}

/** Aggregated reward history and APY metrics returned by the hook. */
export interface RewardHistorySummary {
  /** All daily reward records, oldest first. */
  records: DailyReward[]
  /** Cumulative reward series (same index as records, running total in ETH). */
  cumulativeSeries: number[]
  /** Trailing 7-day APY (%). */
  apy7d: number | null
  /** Trailing 30-day APY (%). */
  apy30d: number | null
  /** Trailing 365-day APY (%). */
  apy365d: number | null
  /** Network average APY for comparison (%). */
  networkAvgApy: number
  /** Total rewards earned across all records (ETH). */
  totalRewardsEth: number
  /** Validator's staked balance (ETH) used for APY denominator. */
  stakedBalanceEth: number
}

/** APY calculator inputs. */
export interface ApyCalculatorInput {
  /** Stake amount in tokens (1–100,000). */
  stakeAmount: number
  /** Number of active validators on the network (100–10,000). */
  activeValidators: number
  /** Network participation rate 50–100 (%). */
  participationRate: number
}

/** Projected reward output from the APY calculator. */
export interface ApyProjection {
  dailyRewardEth: number
  monthlyRewardEth: number
  yearlyRewardEth: number
  projectedApyPct: number
}
