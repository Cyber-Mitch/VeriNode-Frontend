import { describe, it, expect } from 'vitest'
import {
  buildPeerHeightHistogram,
  formatTimeRemaining,
  speedTrendArrow,
} from '@/src/utils/syncHistogram'

// ---------------------------------------------------------------------------
// buildPeerHeightHistogram
// ---------------------------------------------------------------------------

describe('buildPeerHeightHistogram', () => {
  it('returns an empty array when no peer heights are supplied', () => {
    const result = buildPeerHeightHistogram([], 1_000_000)
    expect(result).toHaveLength(0)
  })

  it('produces exactly bucketCount buckets', () => {
    const heights = [100, 200, 300, 400, 500]
    const result = buildPeerHeightHistogram(heights, 250, 5)
    expect(result).toHaveLength(5)
  })

  it('marks exactly one bucket as isLocalNode', () => {
    const heights = [1_000, 2_000, 3_000, 4_000, 5_000]
    const result = buildPeerHeightHistogram(heights, 2_500, 5)
    const localBuckets = result.filter((b) => b.isLocalNode)
    expect(localBuckets).toHaveLength(1)
  })

  it('total count across all buckets equals peerHeights.length', () => {
    const heights = [100, 200, 200, 300, 300, 300]
    const result = buildPeerHeightHistogram(heights, 250, 4)
    const total = result.reduce((s, b) => s + b.count, 0)
    expect(total).toBe(heights.length)
  })

  it('handles all identical peer heights without throwing', () => {
    const heights = [999_999, 999_999, 999_999]
    expect(() => buildPeerHeightHistogram(heights, 999_999, 10)).not.toThrow()
  })

  it('the local node bucket covers the currentHeight value', () => {
    const heights = [1_000, 2_000, 3_000]
    const currentHeight = 1_500
    const result = buildPeerHeightHistogram(heights, currentHeight, 5)
    const localBucket = result.find((b) => b.isLocalNode)!
    expect(localBucket.from).toBeLessThanOrEqual(currentHeight)
    expect(localBucket.to).toBeGreaterThan(currentHeight)
  })
})

// ---------------------------------------------------------------------------
// formatTimeRemaining
// ---------------------------------------------------------------------------

describe('formatTimeRemaining', () => {
  it('returns "< 1 m" for fewer than 60 seconds', () => {
    expect(formatTimeRemaining(0)).toBe('< 1 m')
    expect(formatTimeRemaining(59)).toBe('< 1 m')
  })

  it('formats minutes-only correctly', () => {
    expect(formatTimeRemaining(60)).toBe('1 m')
    expect(formatTimeRemaining(3599)).toBe('59 m')
  })

  it('formats hours + minutes correctly', () => {
    expect(formatTimeRemaining(3600)).toBe('1 h 0 m')
    expect(formatTimeRemaining(7384)).toBe('2 h 3 m')
  })
})

// ---------------------------------------------------------------------------
// speedTrendArrow
// ---------------------------------------------------------------------------

describe('speedTrendArrow', () => {
  it('returns "→" for fewer than 3 data points', () => {
    expect(speedTrendArrow([])).toBe('→')
    expect(speedTrendArrow([{ blocksPerSecond: 10 }])).toBe('→')
    expect(speedTrendArrow([{ blocksPerSecond: 10 }, { blocksPerSecond: 20 }])).toBe('→')
  })

  it('returns "↑" when later values are meaningfully higher', () => {
    const series = [
      { blocksPerSecond: 10 },
      { blocksPerSecond: 10 },
      { blocksPerSecond: 10 },
      { blocksPerSecond: 20 },
      { blocksPerSecond: 20 },
      { blocksPerSecond: 20 },
    ]
    expect(speedTrendArrow(series)).toBe('↑')
  })

  it('returns "↓" when later values are meaningfully lower', () => {
    const series = [
      { blocksPerSecond: 50 },
      { blocksPerSecond: 50 },
      { blocksPerSecond: 50 },
      { blocksPerSecond: 10 },
      { blocksPerSecond: 10 },
      { blocksPerSecond: 10 },
    ]
    expect(speedTrendArrow(series)).toBe('↓')
  })

  it('returns "→" when values are roughly flat', () => {
    const series = Array.from({ length: 9 }, () => ({ blocksPerSecond: 30 }))
    expect(speedTrendArrow(series)).toBe('→')
  })
})
