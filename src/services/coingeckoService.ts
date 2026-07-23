export interface CoinGeckoSimplePriceResponse {
  ethereum?: Record<string, number>
}

export async function fetchEthPrice(currency = 'usd'): Promise<number> {
  const response = await fetch(
    `https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=${encodeURIComponent(currency.toLowerCase())}`,
  )
  if (!response.ok) throw new Error(`CoinGecko price request failed: ${response.status}`)
  const payload = (await response.json()) as CoinGeckoSimplePriceResponse
  const price = payload.ethereum?.[currency.toLowerCase()]
  if (typeof price !== 'number' || !Number.isFinite(price)) throw new Error('CoinGecko response did not include a finite ETH price')
  return price
}
