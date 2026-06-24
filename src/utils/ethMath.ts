export const GWEI_PER_ETH = BigInt(1_000_000_000)
export const STANDARD_VALIDATOR_EFFECTIVE_BALANCE_ETH = 32
export const CONSOLIDATED_VALIDATOR_EFFECTIVE_BALANCE_CAP_ETH = 2048

export function gweiToEth(gwei: bigint): number {
  return Number(gwei) / Number(GWEI_PER_ETH)
}

export function ethToGwei(eth: number): bigint {
  return BigInt(Math.round(eth * Number(GWEI_PER_ETH)))
}

export function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value))
}
