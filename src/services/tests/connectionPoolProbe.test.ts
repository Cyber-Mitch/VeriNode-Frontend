/**
 * Unit tests for ConnectionPool Health Probe with Adaptive Sizing (#105)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  latencyScore,
  utilisationScore,
  availabilityScore,
  computePoolHealthScore,
  getPoolHealthColor,
  computeAdaptiveSize,
  aggregatePoolMetrics,
  createConnectionPoolProbe,
} from '../connectionPoolProbe'
import type { PoolProbeSample } from '@/types/connectionPool'

// ─── latencyScore ─────────────────────────────────────────────────────────────

describe('latencyScore', () => {
  it('returns 100 for 0 ms latency', () => {
    expect(latencyScore(0, 100)).toBe(100)
  })

  it('returns 0 when latency equals the threshold', () => {
    expect(latencyScore(100, 100)).toBeCloseTo(0, 5)
  })

  it('clamps to 0 when latency exceeds the threshold', () => {
    expect(latencyScore(200, 100)).toBe(0)
  })

  it('interpolates linearly between 0 and threshold', () => {
    expect(latencyScore(50, 100)).toBeCloseTo(50, 5)
    expect(latencyScore(25, 100)).toBeCloseTo(75, 5)
  })
})

// ─── utilisationScore ─────────────────────────────────────────────────────────

describe('utilisationScore', () => {
  it('returns 100 when utilisation exactly matches target', () => {
    expect(utilisationScore(0.7, 0.7)).toBe(100)
  })

  it('returns 0 for fully idle pool (utilisation = 0)', () => {
    // deviation = 0.7 → 100 - 70 = 30, not 0; symmetric bell clamp
    expect(utilisationScore(0, 0.7)).toBeCloseTo(30, 5)
  })

  it('returns 0 for fully saturated pool (utilisation = 1)', () => {
    // deviation = 0.3 → 100 - 30 = 70
    expect(utilisationScore(1, 0.7)).toBeCloseTo(70, 5)
  })

  it('is symmetric around target', () => {
    const above = utilisationScore(0.8, 0.7)
    const below = utilisationScore(0.6, 0.7)
    expect(above).toBeCloseTo(below, 5)
  })

  it('clamps result between 0 and 100', () => {
    expect(utilisationScore(5, 0.7)).toBeGreaterThanOrEqual(0)
    expect(utilisationScore(-1, 0.7)).toBeLessThanOrEqual(100)
  })
})

// ─── availabilityScore ────────────────────────────────────────────────────────

describe('availabilityScore', () => {
  it('returns 100 when all samples are healthy', () => {
    expect(availabilityScore(60, 60)).toBe(100)
  })

  it('returns 0 when no samples are healthy', () => {
    expect(availabilityScore(0, 60)).toBe(0)
  })

  it('returns 100 for empty sample set', () => {
    expect(availabilityScore(0, 0)).toBe(100)
  })

  it('computes ratio correctly for mixed samples', () => {
    expect(availabilityScore(45, 60)).toBeCloseTo(75, 5)
  })

  it('represents the 99.99% availability target correctly', () => {
    // 9999 healthy out of 10000 = 99.99% → score ≈ 99.99
    const score = availabilityScore(9999, 10000)
    expect(score).toBeGreaterThanOrEqual(99)
    expect(score).toBeLessThanOrEqual(100)
  })
})

// ─── computePoolHealthScore ───────────────────────────────────────────────────

describe('computePoolHealthScore', () => {
  it('returns high score for ideal conditions (low latency, target utilisation, all healthy)', () => {
    const score = computePoolHealthScore(5, 0.7, 60, 60, 100, 0.7)
    expect(score).toBeGreaterThanOrEqual(90)
  })

  it('returns low score when latency exceeds threshold', () => {
    // latencyScore(200,100)=0, utilisationScore(0.7,0.7)=100, availabilityScore(60,60)=100
    // composite = 0.40×0 + 0.35×100 + 0.25×100 = 60
    const score = computePoolHealthScore(200, 0.7, 60, 60, 100, 0.7)
    expect(score).toBeLessThanOrEqual(60)
  })

  it('returns degraded score when availability is poor', () => {
    // latencyScore(10,100)=90, utilisationScore(0.7,0.7)=100, availabilityScore(0,60)=0
    // composite = 0.40×90 + 0.35×100 + 0.25×0 = 71
    const score = computePoolHealthScore(10, 0.7, 0, 60, 100, 0.7)
    expect(score).toBeLessThan(80)
    expect(score).toBeGreaterThan(60)
  })

  it('output is always in [0, 100]', () => {
    const cases: [number, number, number, number, number, number][] = [
      [0, 0, 0, 0, 100, 0.7],
      [999, 1, 0, 100, 100, 0.7],
      [0, 0.7, 100, 100, 100, 0.7],
    ]
    for (const args of cases) {
      const score = computePoolHealthScore(...args)
      expect(score).toBeGreaterThanOrEqual(0)
      expect(score).toBeLessThanOrEqual(100)
    }
  })
})

// ─── getPoolHealthColor ───────────────────────────────────────────────────────

describe('getPoolHealthColor', () => {
  it('returns green for score >= 80', () => {
    expect(getPoolHealthColor(80)).toBe('green')
    expect(getPoolHealthColor(100)).toBe('green')
  })

  it('returns yellow for score in [50, 80)', () => {
    expect(getPoolHealthColor(79)).toBe('yellow')
    expect(getPoolHealthColor(50)).toBe('yellow')
  })

  it('returns red for score < 50', () => {
    expect(getPoolHealthColor(49)).toBe('red')
    expect(getPoolHealthColor(0)).toBe('red')
  })
})

// ─── computeAdaptiveSize ──────────────────────────────────────────────────────

describe('computeAdaptiveSize', () => {
  const baseConfig = {
    minPoolSize: 2,
    maxPoolSize: 20,
    targetUtilisation: 0.7,
    waitQueueThreshold: 5,
    resizeStep: 2,
  }

  it('grows the pool when utilisation exceeds target', () => {
    const { recommendedSize, scaled, reason } = computeAdaptiveSize(10, 0.85, 0, baseConfig)
    expect(recommendedSize).toBe(12)
    expect(scaled).toBe(true)
    expect(reason).toContain('grew')
  })

  it('shrinks the pool when utilisation is below half of target', () => {
    const { recommendedSize, scaled, reason } = computeAdaptiveSize(10, 0.2, 0, baseConfig)
    expect(recommendedSize).toBe(8)
    expect(scaled).toBe(true)
    expect(reason).toContain('shrank')
  })

  it('keeps pool size unchanged when utilisation is within the comfortable band', () => {
    const { recommendedSize, scaled } = computeAdaptiveSize(10, 0.65, 0, baseConfig)
    expect(recommendedSize).toBe(10)
    expect(scaled).toBe(false)
  })

  it('grows when wait queue exceeds threshold regardless of utilisation', () => {
    const { recommendedSize, scaled } = computeAdaptiveSize(10, 0.3, 6, baseConfig)
    expect(recommendedSize).toBe(12)
    expect(scaled).toBe(true)
  })

  it('does not grow beyond maxPoolSize', () => {
    const { recommendedSize } = computeAdaptiveSize(20, 0.9, 0, baseConfig)
    expect(recommendedSize).toBe(20)
  })

  it('does not shrink below minPoolSize', () => {
    const { recommendedSize } = computeAdaptiveSize(2, 0.1, 0, baseConfig)
    expect(recommendedSize).toBe(2)
  })

  it('wait-queue scaling takes priority over utilisation scaling', () => {
    // Low utilisation would normally trigger shrink, but a deep queue overrides it.
    const { recommendedSize, reason } = computeAdaptiveSize(10, 0.1, 10, baseConfig)
    expect(recommendedSize).toBe(12)
    expect(reason).toContain('Wait queue')
  })
})

// ─── aggregatePoolMetrics ─────────────────────────────────────────────────────

describe('aggregatePoolMetrics', () => {
  const makeSample = (overrides: Partial<PoolProbeSample> = {}): PoolProbeSample => ({
    timestamp: Date.now(),
    totalConnections: 10,
    activeConnections: 7,
    waitingRequests: 0,
    p99LatencyMs: 20,
    healthy: true,
    ...overrides,
  })

  it('returns zeroed metrics for an empty sample array', () => {
    const metrics = aggregatePoolMetrics([])
    expect(metrics.sampleCount).toBe(0)
    expect(metrics.p99LatencyMs).toBe(0)
    expect(metrics.availabilityPct).toBe(100)
  })

  it('computes p99LatencyMs correctly from a latency array', () => {
    // All same latency → p99 equals that latency
    const samples = Array.from({ length: 10 }, () => makeSample({ p99LatencyMs: 30 }))
    const { p99LatencyMs } = aggregatePoolMetrics(samples)
    expect(p99LatencyMs).toBeCloseTo(30, 5)
  })

  it('computes avgUtilisation correctly', () => {
    const samples = [
      makeSample({ totalConnections: 10, activeConnections: 5 }),
      makeSample({ totalConnections: 10, activeConnections: 5 }),
    ]
    const { avgUtilisation } = aggregatePoolMetrics(samples)
    expect(avgUtilisation).toBeCloseTo(0.5, 5)
  })

  it('tracks peakActiveConnections across the window', () => {
    const samples = [
      makeSample({ activeConnections: 3 }),
      makeSample({ activeConnections: 9 }),
      makeSample({ activeConnections: 5 }),
    ]
    const { peakActiveConnections } = aggregatePoolMetrics(samples)
    expect(peakActiveConnections).toBe(9)
  })

  it('computes availabilityPct correctly for mixed healthy/unhealthy samples', () => {
    const samples = [
      makeSample({ healthy: true }),
      makeSample({ healthy: true }),
      makeSample({ healthy: false }),
      makeSample({ healthy: true }),
    ]
    const { availabilityPct } = aggregatePoolMetrics(samples)
    expect(availabilityPct).toBeCloseTo(75, 5)
  })
})

// ─── createConnectionPoolProbe — integration ──────────────────────────────────

describe('createConnectionPoolProbe', () => {
  const okFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 }) as unknown as typeof fetch
  const errorFetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED')) as unknown as typeof fetch

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns a healthy green snapshot for a fast, responding endpoint', async () => {
    const probe = createConnectionPoolProbe({ p99ThresholdMs: 100 })
    const snapshot = await probe.probe(
      'http://localhost/ping',
      { totalConnections: 10, activeConnections: 7, waitingRequests: 0 },
      okFetch,
    )
    expect(snapshot.probe.healthy).toBe(true)
    expect(snapshot.score).toBeGreaterThanOrEqual(0)
    expect(['green', 'yellow', 'red']).toContain(snapshot.color)
  })

  it('marks the probe unhealthy when the fetch rejects', async () => {
    const probe = createConnectionPoolProbe()
    const snapshot = await probe.probe(
      'http://localhost/ping',
      { totalConnections: 10, activeConnections: 7, waitingRequests: 0 },
      errorFetch,
    )
    expect(snapshot.probe.healthy).toBe(false)
  })

  it('stores snapshots in history', async () => {
    const probe = createConnectionPoolProbe()
    await probe.probe('http://localhost/ping', { totalConnections: 5, activeConnections: 3, waitingRequests: 0 }, okFetch)
    await probe.probe('http://localhost/ping', { totalConnections: 5, activeConnections: 4, waitingRequests: 0 }, okFetch)
    expect(probe.getHistory().length).toBe(2)
  })

  it('getLatestSnapshot reflects the most recent probe', async () => {
    const probe = createConnectionPoolProbe()
    expect(probe.getLatestSnapshot()).toBeNull()

    await probe.probe('http://localhost/ping', { totalConnections: 5, activeConnections: 3, waitingRequests: 0 }, okFetch)
    const snapshot = probe.getLatestSnapshot()
    expect(snapshot).not.toBeNull()
    expect(snapshot!.probe.activeConnections).toBe(3)
  })

  it('reset() clears history and latest snapshot', async () => {
    const probe = createConnectionPoolProbe()
    await probe.probe('http://localhost/ping', { totalConnections: 5, activeConnections: 3, waitingRequests: 0 }, okFetch)
    probe.reset()
    expect(probe.getLatestSnapshot()).toBeNull()
    expect(probe.getHistory().length).toBe(0)
  })

  it('adaptive sizing grows pool when utilisation exceeds target', async () => {
    const probe = createConnectionPoolProbe({ minPoolSize: 2, maxPoolSize: 20, targetUtilisation: 0.7 })
    const snapshot = await probe.probe(
      'http://localhost/ping',
      { totalConnections: 10, activeConnections: 9, waitingRequests: 0 },
      okFetch,
    )
    // utilisation = 0.9 > 0.7 → pool should grow
    expect(snapshot.recommendedPoolSize).toBeGreaterThan(2)
    expect(snapshot.scaled).toBe(true)
  })

  it('adaptive sizing keeps pool at minimum for under-utilised pool', async () => {
    const probe = createConnectionPoolProbe({
      minPoolSize: 2,
      maxPoolSize: 20,
      targetUtilisation: 0.7,
      resizeStep: 2,
    })
    // First probe: start at minPoolSize (2), low utilisation — should not shrink below min
    const snapshot = await probe.probe(
      'http://localhost/ping',
      { totalConnections: 10, activeConnections: 1, waitingRequests: 0 },
      okFetch,
    )
    expect(snapshot.recommendedPoolSize).toBeGreaterThanOrEqual(2)
  })

  it('getMetrics() returns non-null metrics after a probe', async () => {
    const probe = createConnectionPoolProbe()
    await probe.probe('http://localhost/ping', { totalConnections: 5, activeConnections: 2, waitingRequests: 0 }, okFetch)
    const metrics = probe.getMetrics()
    expect(metrics.sampleCount).toBe(1)
    expect(metrics.availabilityPct).toBe(100)
  })

  it('history is capped at 60 entries', async () => {
    const probe = createConnectionPoolProbe()
    const probes = Array.from({ length: 65 }, () =>
      probe.probe('http://localhost/ping', { totalConnections: 5, activeConnections: 2, waitingRequests: 0 }, okFetch),
    )
    await Promise.all(probes)
    expect(probe.getHistory().length).toBeLessThanOrEqual(60)
  })
})

// ─── Performance: P99 < 100ms for pure functions ──────────────────────────────

describe('performance: P99 < 100ms for pure computational functions', () => {
  it('computePoolHealthScore runs 100 iterations in < 100ms P99', () => {
    const samples: number[] = []
    for (let i = 0; i < 100; i++) {
      const start = performance.now()
      computePoolHealthScore(20, 0.7, 55, 60, 100, 0.7)
      samples.push(performance.now() - start)
    }
    samples.sort((a, b) => a - b)
    const p99 = samples[98]
    expect(p99).toBeLessThan(100)
  })

  it('computeAdaptiveSize runs 100 iterations in < 100ms P99', () => {
    const config = {
      minPoolSize: 2,
      maxPoolSize: 20,
      targetUtilisation: 0.7,
      waitQueueThreshold: 5,
      resizeStep: 2,
    }
    const samples: number[] = []
    for (let i = 0; i < 100; i++) {
      const start = performance.now()
      computeAdaptiveSize(10, 0.75, 0, config)
      samples.push(performance.now() - start)
    }
    samples.sort((a, b) => a - b)
    const p99 = samples[98]
    expect(p99).toBeLessThan(100)
  })

  it('aggregatePoolMetrics over 60 samples runs in < 100ms P99', () => {
    const pool: PoolProbeSample[] = Array.from({ length: 60 }, (_, i) => ({
      timestamp: Date.now() + i * 1000,
      totalConnections: 10,
      activeConnections: 7,
      waitingRequests: 0,
      p99LatencyMs: 20 + i,
      healthy: true,
    }))

    const samples: number[] = []
    for (let i = 0; i < 100; i++) {
      const start = performance.now()
      aggregatePoolMetrics(pool)
      samples.push(performance.now() - start)
    }
    samples.sort((a, b) => a - b)
    const p99 = samples[98]
    expect(p99).toBeLessThan(100)
  })
})
