import { describe, expect, it } from 'vitest'
import { add, compound, div, formatGwei, mul, parseGwei, pct, sub } from '../utils/gweiMath'
import { PrecisionOverflowError, UINT256_MAX } from '../utils/overflowGuard'

describe('gweiMath', () => {
  it('parses only integer gwei strings', () => {
    expect(parseGwei('1000000000')).toBe(BigInt(1_000_000_000))
    expect(() => parseGwei('1.5')).toThrow(TypeError)
  })

  it('performs BigInt arithmetic and fixed-point division', () => {
    expect(add('2', BigInt(3))).toBe(BigInt(5))
    expect(sub('5', '3')).toBe(BigInt(2))
    expect(mul('7', 6)).toBe(BigInt(42))
    expect(div('1', '2')).toBe(BigInt(500_000_000_000_000_000))
  })

  it('truncates ETH display to gwei precision', () => {
    expect(formatGwei(BigInt(1_234_567_891), 'eth', 6)).toBe('1.234567 ETH')
    expect(formatGwei(BigInt(1_234_567_891), 'eth')).toBe('1.234567891 ETH')
  })

  it('calculates percentage and compound projections without floating point ETH math', () => {
    expect(pct(BigInt(100_000_000_000), 5)).toBe(BigInt(5_000_000_000))
    expect(compound(BigInt(100_000_000_000), 12, 12)).toBeGreaterThan(BigInt(112_000_000_000))
  })

  it('guards uint256 overflow', () => {
    expect(() => add(UINT256_MAX, BigInt(1))).toThrow(PrecisionOverflowError)
  })
})
