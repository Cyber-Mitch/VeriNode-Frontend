import { describe, expect, it } from 'vitest'
import { computeWebSocketHealthScore } from '@/src/utils/healthScore'

describe('computeWebSocketHealthScore', () => {
  it('returns 100 for perfect uptime, zero latency, and zero reconnects', () => {
    const result = computeWebSocketHealthScore({
      uptimeRatioLast60s: 1,
      avgMessageLatencyMs: 0,
      consecutiveReconnects: 0,
    })

    expect(result.totalScore).toBe(100)
  })

  it('returns 0 when latency is ≥ 1000ms and reconnects are at decay zero point', () => {
    const result = computeWebSocketHealthScore({
      uptimeRatioLast60s: 0,
      avgMessageLatencyMs: 1_000,
      consecutiveReconnects: 3,
    })

    expect(result.totalScore).toBe(0)
  })

  it('clamps and decays linearly across the reconnects component', () => {
    const result = computeWebSocketHealthScore({
      uptimeRatioLast60s: 0.5,
      avgMessageLatencyMs: 1_000,
      consecutiveReconnects: 1,
    })

    // uptimeScore = 25
    // latencyScore = 0
    // reconnectScore = 20 * (1 - 1/3) = 13.33 → 13
    // total = 38
    expect(result.totalScore).toBe(38)
  })
})

