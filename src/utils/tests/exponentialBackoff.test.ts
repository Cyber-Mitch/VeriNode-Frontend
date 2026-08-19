import { describe, expect, it, vi } from 'vitest'
import { computeTier2ExponentialBackoffMs } from '@/src/utils/exponentialBackoff'

describe('computeTier2ExponentialBackoffMs', () => {
  it('uses 5s → 15s → 45s → 135s schedule (with deterministic zero jitter)', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)

    expect(computeTier2ExponentialBackoffMs(1)).toBe(5_000)
    expect(computeTier2ExponentialBackoffMs(2)).toBe(15_000)
    expect(computeTier2ExponentialBackoffMs(3)).toBe(45_000)
    expect(computeTier2ExponentialBackoffMs(4)).toBe(135_000)
    expect(computeTier2ExponentialBackoffMs(5)).toBe(300_000)

    vi.restoreAllMocks()
  })
})

