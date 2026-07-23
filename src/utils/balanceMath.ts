// Shared validator balance math.
//
// Amounts are bigint gwei. The target compiles to ES2017, so bigint *literals*
// (e.g. `32n`) are unavailable — all constants use the BigInt() constructor.

export const GWEI_PER_ETH = BigInt(1_000_000_000)

/**
 * Effective-balance cap. Per the reconciliation invariants this is 32 ETH
 * (effective_balance = min(actual_balance, 32 ETH)). Post-Electra (EIP-7251)
 * raised the max effective balance to 2048 ETH for 0x02 validators — change
 * this single constant to model that regime.
 */
export const EFFECTIVE_BALANCE_CAP_GWEI = BigInt(32) * GWEI_PER_ETH

/** Epochs per day at 6.4-minute epochs (32 slots × 12 s). */
export const EPOCHS_PER_DAY = 225

export function maxBigInt(a: bigint, b: bigint): bigint {
  return a > b ? a : b
}

export function minBigInt(a: bigint, b: bigint): bigint {
  return a < b ? a : b
}

const ZERO = BigInt(0)

/** Effective balance = min(actual, cap). */
export function effectiveBalance(actualGwei: bigint, cap = EFFECTIVE_BALANCE_CAP_GWEI): bigint {
  return minBigInt(actualGwei, cap)
}

/** Excess of actual balance over the cap, floored at 0. */
export function excessOverCap(actualGwei: bigint, cap = EFFECTIVE_BALANCE_CAP_GWEI): bigint {
  return maxBigInt(ZERO, actualGwei - cap)
}

/** Whether the validator's actual balance exceeds the cap. */
export function isCapped(actualGwei: bigint, cap = EFFECTIVE_BALANCE_CAP_GWEI): boolean {
  return actualGwei > cap
}

/** Convert gwei to a floating-point ETH value (display only). */
export function gweiToEth(gwei: bigint): number {
  return Number(gwei) / Number(GWEI_PER_ETH)
}

/** Format a gwei amount as an ETH string with `decimals` places (sign-aware). */
export function formatEth(gwei: bigint, decimals = 4): string {
  const negative = gwei < ZERO
  const abs = negative ? -gwei : gwei
  const whole = abs / GWEI_PER_ETH
  const frac = abs % GWEI_PER_ETH
  const fracStr = frac.toString().padStart(9, '0').slice(0, decimals)
  const sign = negative ? '-' : ''
  return decimals > 0 ? `${sign}${whole.toString()}.${fracStr}` : `${sign}${whole.toString()}`
}
