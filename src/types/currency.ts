export type GweiAmount = bigint

export type CurrencyCode = 'ETH' | 'GWEI' | 'USD' | (string & {})

export interface CurrencyAmount {
  amount: bigint
  currency: CurrencyCode
  decimals: number
}

export interface DisplayAmount {
  value: string
  unit: 'eth' | 'gwei' | 'fiat'
  currency?: CurrencyCode
}

export interface FiatRate {
  rate: bigint
  decimals: number
  currency: CurrencyCode
  fetchedAt: number
}
