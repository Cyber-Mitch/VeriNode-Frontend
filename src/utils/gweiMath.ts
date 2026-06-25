import { assertUint256, guarded } from './overflowGuard'

export const ZERO = BigInt(0)
export const GWEI_PER_ETH = BigInt(1_000_000_000)
export const FIXED_POINT_DECIMALS = 18
export const FIXED_POINT_SCALE = BigInt(1_000_000_000_000_000_000)
const INTEGER_PATTERN = /^-?\d+$/

export function parseGwei(value: bigint | string): bigint {
  if (typeof value === 'bigint') return assertUint256(value)
  if (!INTEGER_PATTERN.test(value)) {
    throw new TypeError('Gwei string inputs must match /^-?\\d+$/')
  }
  return assertUint256(BigInt(value))
}

export function add(a: bigint | string, b: bigint | string): bigint {
  return guarded(() => parseGwei(a) + parseGwei(b))
}

export function sub(a: bigint | string, b: bigint | string): bigint {
  return guarded(() => parseGwei(a) - parseGwei(b))
}

export function mul(a: bigint | string, scalar: number): bigint {
  if (!Number.isSafeInteger(scalar)) throw new TypeError('Scalar must be a safe integer')
  return guarded(() => parseGwei(a) * BigInt(scalar))
}

export function div(a: bigint | string, b: bigint | string, precision = FIXED_POINT_DECIMALS): bigint {
  const divisor = parseGwei(b)
  if (divisor === ZERO) throw new RangeError('Cannot divide by zero')
  if (!Number.isSafeInteger(precision) || precision < 0 || precision > 36) {
    throw new RangeError('Precision must be a safe integer between 0 and 36')
  }
  const scale = BigInt(10) ** BigInt(precision)
  return guarded(() => (parseGwei(a) * scale) / divisor)
}

function decimalToFixed(value: number, decimals = FIXED_POINT_DECIMALS): bigint {
  if (!Number.isFinite(value)) throw new TypeError('Decimal value must be finite')
  const sign = value < 0 ? '-' : ''
  const [whole, fraction = ''] = Math.abs(value).toFixed(decimals).split('.')
  return BigInt(`${sign}${whole}${fraction.padEnd(decimals, '0')}`)
}

export function pct(value: bigint | string, percentage: number): bigint {
  const rate = decimalToFixed(percentage / 100)
  return guarded(() => (parseGwei(value) * rate) / FIXED_POINT_SCALE)
}

export function compound(principal: bigint | string, annualRatePct: number, periods: number): bigint {
  if (!Number.isSafeInteger(periods) || periods < 0) throw new RangeError('Periods must be a non-negative safe integer')
  const periodRate = decimalToFixed(annualRatePct / 100 / Math.max(periods, 1))
  let amount = parseGwei(principal)
  for (let period = 0; period < periods; period += 1) {
    amount = guarded(() => (amount * (FIXED_POINT_SCALE + periodRate)) / FIXED_POINT_SCALE)
  }
  return amount
}

export function formatGwei(value: bigint | string, unit: 'eth' | 'gwei' | 'fiat', decimals = unit === 'eth' ? 9 : 2): string {
  const parsed = parseGwei(value)
  const negative = parsed < ZERO
  const abs = negative ? -parsed : parsed
  const sign = negative ? '-' : ''

  if (unit === 'gwei') return `${sign}${abs.toString()} gwei`

  if (unit === 'eth') {
    const whole = abs / GWEI_PER_ETH
    const fraction = (abs % GWEI_PER_ETH).toString().padStart(9, '0').slice(0, Math.min(decimals, 9))
    return decimals > 0 ? `${sign}${whole.toString()}.${fraction} ETH` : `${sign}${whole.toString()} ETH`
  }

  const scale = BigInt(10) ** BigInt(Math.max(0, decimals))
  const whole = abs / scale
  const fraction = (abs % scale).toString().padStart(decimals, '0')
  return decimals > 0 ? `${sign}$${whole.toString()}.${fraction}` : `${sign}$${whole.toString()}`
}
