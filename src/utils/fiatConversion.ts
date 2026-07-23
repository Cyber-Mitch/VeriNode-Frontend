import { fetchEthPrice } from '../services/coingeckoService'
import type { CurrencyAmount, FiatRate, GweiAmount } from '../types/currency'
import { GWEI_PER_ETH } from './gweiMath'
import { assertUint256, guarded } from './overflowGuard'

const RATE_DECIMALS = 18
const RATE_SCALE = BigInt(1_000_000_000_000_000_000)
const CACHE_TTL_MS = 5 * 60 * 1000
let cachedRate: FiatRate | null = null

function numberToFixed(value: number, decimals: number): bigint {
  const [whole, fraction = ''] = value.toFixed(decimals).split('.')
  return BigInt(`${whole}${fraction.padEnd(decimals, '0')}`)
}

export async function getEthFiatRate(currency = 'USD'): Promise<FiatRate> {
  const now = Date.now()
  if (cachedRate && cachedRate.currency === currency && now - cachedRate.fetchedAt < CACHE_TTL_MS) return cachedRate
  const rate = numberToFixed(await fetchEthPrice(currency), RATE_DECIMALS)
  cachedRate = { rate, decimals: RATE_DECIMALS, currency, fetchedAt: now }
  return cachedRate
}

export function convertGweiToFiat(gwei: GweiAmount, rate: FiatRate): CurrencyAmount {
  const amount = guarded(() => (assertUint256(gwei) * rate.rate) / GWEI_PER_ETH / RATE_SCALE)
  return { amount, currency: rate.currency, decimals: 0 }
}

export function convertGweiToFiatCents(gwei: GweiAmount, rate: FiatRate): CurrencyAmount {
  const amount = guarded(() => (assertUint256(gwei) * rate.rate * BigInt(100)) / GWEI_PER_ETH / RATE_SCALE)
  return { amount, currency: rate.currency, decimals: 2 }
}

export function clearFiatRateCache(): void {
  cachedRate = null
}
