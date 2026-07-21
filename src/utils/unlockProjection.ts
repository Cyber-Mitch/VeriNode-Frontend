// Projected-unlock calculator for capped validators.
//
// When a validator's actual balance exceeds the effective-balance cap, the
// excess is swept out gradually by partial withdrawals. The projection
// estimates how long the excess represents in reward-equivalent time, per the
// invariant:
//
//   eta_days = (actual_balance - cap) / avg_daily_reward_rate   ± 15%
//
// The reward rate is a 7-day trailing average of decomposed consensus rewards.

import type { ReconciliationRecord, UnlockProjection } from '@/src/types/validator'
import { EFFECTIVE_BALANCE_CAP_GWEI, excessOverCap, isCapped } from '@/src/utils/balanceMath'

const ZERO = BigInt(0)
const DAY_MS = 24 * 60 * 60 * 1000
const TRAILING_DAYS = 7
const ERROR_BOUND = 0.15

function emptyProjection(validatorIndex: number, excess: bigint, avgDaily: bigint): UnlockProjection {
  return {
    validatorIndex,
    capped: excess > ZERO,
    excessGwei: excess,
    avgDailyRewardGwei: avgDaily,
    etaDays: null,
    etaDaysLow: null,
    etaDaysHigh: null,
    unlockDate: null,
    unlockDateLow: null,
    unlockDateHigh: null,
  }
}

/**
 * Average daily reward (gwei/day) over the trailing 7 days of records, scaled
 * by the actual span covered so short histories still yield a sane rate.
 */
export function trailingDailyReward(
  records: ReconciliationRecord[],
  trailingDays = TRAILING_DAYS,
): bigint {
  if (records.length === 0) return ZERO
  const dataNow = records[records.length - 1].timestamp
  const windowStart = dataNow - trailingDays * DAY_MS

  let sumRewards = ZERO
  let earliest = dataNow
  for (const r of records) {
    if (r.timestamp > windowStart) {
      sumRewards += r.rewardsGwei
      if (r.timestamp < earliest) earliest = r.timestamp
    }
  }
  if (sumRewards <= ZERO) return ZERO

  const spanDays = Math.min(trailingDays, Math.max(1, (dataNow - earliest) / DAY_MS))
  return BigInt(Math.round(Number(sumRewards) / spanDays))
}

/**
 * Project the unlock ETA for a validator from its reconciliation records.
 * Returns excess + reward rate always; ETA/dates are null when the validator
 * is not capped or has no positive trailing reward rate.
 */
export function projectUnlock(
  validatorIndex: number,
  records: ReconciliationRecord[],
  options: { now?: number; cap?: bigint } = {},
): UnlockProjection {
  const { now = Date.now(), cap = EFFECTIVE_BALANCE_CAP_GWEI } = options

  if (records.length === 0) return emptyProjection(validatorIndex, ZERO, ZERO)

  const actual = records[records.length - 1].actualBalanceGwei
  const excess = excessOverCap(actual, cap)
  const avgDaily = trailingDailyReward(records)

  if (!isCapped(actual, cap) || avgDaily <= ZERO) {
    return emptyProjection(validatorIndex, excess, avgDaily)
  }

  const etaDays = Number(excess) / Number(avgDaily)
  const etaDaysLow = etaDays * (1 - ERROR_BOUND)
  const etaDaysHigh = etaDays * (1 + ERROR_BOUND)

  return {
    validatorIndex,
    capped: true,
    excessGwei: excess,
    avgDailyRewardGwei: avgDaily,
    etaDays,
    etaDaysLow,
    etaDaysHigh,
    unlockDate: now + etaDays * DAY_MS,
    unlockDateLow: now + etaDaysLow * DAY_MS,
    unlockDateHigh: now + etaDaysHigh * DAY_MS,
  }
}
