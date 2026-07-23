/**
 * Connection Pool Health Probe with Adaptive Sizing (#105)
 *
 * Provides:
 *   - Lightweight health probing of a connection pool via a configurable ping
 *     endpoint, measuring P99 latency over a sliding window of samples.
 *   - Adaptive pool-size recommendation: grows when utilisation > target,
 *     shrinks when consistently under-utilised, clamped to [minPoolSize,
 *     maxPoolSize].
 *   - Composite health score (0–100) and traffic-light color, matching the
 *     pattern established by `compositeScore.ts` for finality health.
 *   - Factory-function API (`createConnectionPoolProbe`) plus pure utility
 *     exports for isolated unit testing.
 *
 * Design notes:
 *   - No external dependencies beyond the global `fetch` / `performance` APIs.
 *   - All latency math is pure and exported for testing.
 *   - The service is environment-agnostic (browser + Node test env).
 */

import { calculateLatencyPercentiles } from '@/utils/percentileCalculator'
import type {
  PoolHealthColor,
  PoolHealthMetrics,
  PoolHealthSnapshot,
  PoolProbeSample,
  PoolProbeConfig,
} from '@/types/connectionPool'

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_MIN_POOL_SIZE = 2
const DEFAULT_MAX_POOL_SIZE = 20
const DEFAULT_TARGET_UTILISATION = 0.7
const DEFAULT_P99_THRESHOLD_MS = 100
const DEFAULT_WAIT_QUEUE_THRESHOLD = 5
const DEFAULT_RESIZE_STEP = 2

/** Number of probe samples retained for metrics computation. */
const HISTORY_WINDOW = 60

// ─── Weights for composite score ──────────────────────────────────────────────

const LATENCY_WEIGHT = 0.40
const UTILISATION_WEIGHT = 0.35
const AVAILABILITY_WEIGHT = 0.25

// ─── Pure utility functions ────────────────────────────────────────────────────

function clamp(value: number, min = 0, max = 100): number {
  return Math.min(max, Math.max(min, value))
}

/**
 * Derive a 0–100 latency sub-score where 0 ms = 100 and values at or above
 * `thresholdMs` = 0.  Linear interpolation between 0 and the threshold.
 *
 * Exported for isolated unit testing.
 */
export function latencyScore(p99Ms: number, thresholdMs: number): number {
  if (p99Ms <= 0) return 100
  return clamp(100 - (p99Ms / thresholdMs) * 100)
}

/**
 * Derive a 0–100 utilisation sub-score.  The target utilisation scores 100;
 * both idle (near 0) and fully saturated (near 1) score lower because either
 * extreme indicates waste or overload.
 *
 * The bell-curve mapping penalises deviation from `target` symmetrically.
 *
 * Exported for isolated unit testing.
 */
export function utilisationScore(utilisation: number, target: number): number {
  const deviation = Math.abs(utilisation - target)
  // 0 deviation = 100, full deviation (1.0) = 0
  return clamp(100 - deviation * 100)
}

/**
 * Derive a 0–100 availability sub-score from the ratio of healthy samples.
 * A 99.99% availability target maps to ≥ 99 score.
 *
 * Exported for isolated unit testing.
 */
export function availabilityScore(healthySamples: number, totalSamples: number): number {
  if (totalSamples === 0) return 100
  return clamp((healthySamples / totalSamples) * 100)
}

/**
 * Compute the composite health score (0–100) from sub-scores weighted by
 * latency (40%), utilisation (35%), and availability (25%).
 *
 * Exported for isolated unit testing.
 */
export function computePoolHealthScore(
  p99Ms: number,
  utilisation: number,
  healthySamples: number,
  totalSamples: number,
  thresholdMs: number,
  targetUtilisation: number,
): number {
  const lat = latencyScore(p99Ms, thresholdMs)
  const util = utilisationScore(utilisation, targetUtilisation)
  const avail = availabilityScore(healthySamples, totalSamples)
  return clamp(
    LATENCY_WEIGHT * lat + UTILISATION_WEIGHT * util + AVAILABILITY_WEIGHT * avail,
  )
}

/**
 * Map a composite score to a traffic-light color matching the convention used
 * throughout VeriNode (≥80 green, ≥50 yellow, <50 red).
 *
 * Exported for isolated unit testing.
 */
export function getPoolHealthColor(score: number): PoolHealthColor {
  if (score >= 80) return 'green'
  if (score >= 50) return 'yellow'
  return 'red'
}

/**
 * Determine the adaptive pool-size recommendation and the reason for any
 * scaling decision.
 *
 *   utilisation > target              → grow by `step` (bounded by maxPoolSize)
 *   utilisation < target * 0.5        → shrink by `step` (bounded by minPoolSize)
 *   waitingRequests > waitQueueThreshold → grow by `step` immediately
 *   otherwise                         → keep current size
 *
 * Exported for isolated unit testing.
 */
export function computeAdaptiveSize(
  currentSize: number,
  utilisation: number,
  waitingRequests: number,
  config: Required<Pick<PoolProbeConfig, 'minPoolSize' | 'maxPoolSize' | 'targetUtilisation' | 'waitQueueThreshold' | 'resizeStep'>>,
): { recommendedSize: number; scaled: boolean; reason: string | null } {
  const { minPoolSize, maxPoolSize, targetUtilisation, waitQueueThreshold, resizeStep } = config

  if (waitingRequests > waitQueueThreshold) {
    const recommendedSize = Math.min(currentSize + resizeStep, maxPoolSize)
    const scaled = recommendedSize !== currentSize
    return {
      recommendedSize,
      scaled,
      reason: scaled
        ? `Wait queue depth ${waitingRequests} exceeded threshold ${waitQueueThreshold}; grew pool by ${resizeStep}`
        : `Wait queue exceeded threshold but pool is already at max size (${maxPoolSize})`,
    }
  }

  if (utilisation > targetUtilisation) {
    const recommendedSize = Math.min(currentSize + resizeStep, maxPoolSize)
    const scaled = recommendedSize !== currentSize
    return {
      recommendedSize,
      scaled,
      reason: scaled
        ? `Utilisation ${(utilisation * 100).toFixed(1)}% > target ${(targetUtilisation * 100).toFixed(1)}%; grew pool by ${resizeStep}`
        : `Utilisation exceeded target but pool is already at max size (${maxPoolSize})`,
    }
  }

  if (utilisation < targetUtilisation * 0.5) {
    const recommendedSize = Math.max(currentSize - resizeStep, minPoolSize)
    const scaled = recommendedSize !== currentSize
    return {
      recommendedSize,
      scaled,
      reason: scaled
        ? `Utilisation ${(utilisation * 100).toFixed(1)}% < ${(targetUtilisation * 50).toFixed(1)}% (half of target); shrank pool by ${resizeStep}`
        : `Utilisation below half-target but pool is already at min size (${minPoolSize})`,
    }
  }

  return { recommendedSize: currentSize, scaled: false, reason: null }
}

/**
 * Aggregate raw probe samples into health metrics.
 *
 * Exported for isolated unit testing.
 */
export function aggregatePoolMetrics(samples: PoolProbeSample[]): PoolHealthMetrics {
  if (samples.length === 0) {
    return {
      p99LatencyMs: 0,
      avgUtilisation: 0,
      peakActiveConnections: 0,
      sampleCount: 0,
      availabilityPct: 100,
    }
  }

  const latencies = samples.map((s) => s.p99LatencyMs)
  const { p99 } = calculateLatencyPercentiles(latencies)

  const avgUtilisation =
    samples.reduce((acc, s) => acc + (s.totalConnections > 0 ? s.activeConnections / s.totalConnections : 0), 0) /
    samples.length

  const peakActiveConnections = Math.max(...samples.map((s) => s.activeConnections))

  const healthySamples = samples.filter((s) => s.healthy).length
  const availabilityPct = (healthySamples / samples.length) * 100

  return {
    p99LatencyMs: p99,
    avgUtilisation,
    peakActiveConnections,
    sampleCount: samples.length,
    availabilityPct,
  }
}

// ─── Probe service factory ────────────────────────────────────────────────────

/** Public interface exposed by `createConnectionPoolProbe`. */
export interface ConnectionPoolProbe {
  /**
   * Execute a single health probe against `probeUrl`.  Measures round-trip
   * latency, derives adaptive pool-size recommendation, and returns a
   * `PoolHealthSnapshot`.
   *
   * The probe is a lightweight HEAD/GET request; the caller may provide a mock
   * `fetchFn` for testing.
   */
  probe(
    probeUrl: string,
    currentPoolState: { totalConnections: number; activeConnections: number; waitingRequests: number },
    fetchFn?: typeof fetch,
  ): Promise<PoolHealthSnapshot>

  /** Latest snapshot, or null before the first probe. */
  getLatestSnapshot(): PoolHealthSnapshot | null

  /** Aggregated metrics over the retained history window. */
  getMetrics(): PoolHealthMetrics

  /** Full history of retained probe snapshots (oldest first). */
  getHistory(): ReadonlyArray<PoolHealthSnapshot>

  /** Clear all retained history and reset the snapshot. */
  reset(): void
}

/**
 * Create a connection-pool health probe bound to the supplied configuration.
 *
 * @example
 * ```ts
 * const probe = createConnectionPoolProbe({ maxPoolSize: 10 })
 * const snapshot = await probe.probe('/api/v1/db/ping', { totalConnections: 5, activeConnections: 3, waitingRequests: 0 })
 * console.log(snapshot.color, snapshot.recommendedPoolSize)
 * ```
 */
export function createConnectionPoolProbe(config: PoolProbeConfig = {}): ConnectionPoolProbe {
  const {
    minPoolSize = DEFAULT_MIN_POOL_SIZE,
    maxPoolSize = DEFAULT_MAX_POOL_SIZE,
    targetUtilisation = DEFAULT_TARGET_UTILISATION,
    p99ThresholdMs = DEFAULT_P99_THRESHOLD_MS,
    waitQueueThreshold = DEFAULT_WAIT_QUEUE_THRESHOLD,
    resizeStep = DEFAULT_RESIZE_STEP,
  } = config

  const resolvedConfig = {
    minPoolSize,
    maxPoolSize,
    targetUtilisation,
    p99ThresholdMs,
    waitQueueThreshold,
    resizeStep,
  }

  // Retain the last HISTORY_WINDOW snapshots.
  const history: PoolHealthSnapshot[] = []
  let latestSnapshot: PoolHealthSnapshot | null = null

  // Track current recommended size across probes so adaptive decisions are
  // incremental rather than starting from scratch each time.
  let currentRecommendedSize = minPoolSize

  function addToHistory(snapshot: PoolHealthSnapshot): void {
    history.push(snapshot)
    if (history.length > HISTORY_WINDOW) history.shift()
  }

  async function probe(
    probeUrl: string,
    currentPoolState: { totalConnections: number; activeConnections: number; waitingRequests: number },
    fetchFn: typeof fetch = fetch,
  ): Promise<PoolHealthSnapshot> {
    const { totalConnections, activeConnections, waitingRequests } = currentPoolState

    // ── Measure probe latency ──────────────────────────────────────────────
    const start = performance.now()
    let healthy = true

    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), resolvedConfig.p99ThresholdMs * 5)
      try {
        const res = await fetchFn(probeUrl, { method: 'HEAD', signal: controller.signal })
        healthy = res.ok || res.status === 405 // 405 Method Not Allowed is acceptable for HEAD
      } finally {
        clearTimeout(timeoutId)
      }
    } catch {
      healthy = false
    }

    const probeLatencyMs = performance.now() - start

    // ── Build probe sample ─────────────────────────────────────────────────
    const sample: PoolProbeSample = {
      timestamp: Date.now(),
      totalConnections,
      activeConnections,
      waitingRequests,
      p99LatencyMs: probeLatencyMs,
      healthy,
    }

    // ── Adaptive sizing ────────────────────────────────────────────────────
    const utilisation = totalConnections > 0 ? activeConnections / totalConnections : 0
    const sizing = computeAdaptiveSize(
      currentRecommendedSize,
      utilisation,
      waitingRequests,
      resolvedConfig,
    )
    currentRecommendedSize = sizing.recommendedSize

    // ── Derive metrics from history including the new sample ───────────────
    const allSamples = [...history.map((h) => h.probe), sample]
    const windowSamples = allSamples.slice(-HISTORY_WINDOW)
    const latencies = windowSamples.map((s) => s.p99LatencyMs)
    const { p99 } = calculateLatencyPercentiles(latencies)

    const healthySamples = windowSamples.filter((s) => s.healthy).length
    const score = Math.round(
      computePoolHealthScore(
        p99,
        utilisation,
        healthySamples,
        windowSamples.length,
        resolvedConfig.p99ThresholdMs,
        resolvedConfig.targetUtilisation,
      ),
    )

    const snapshot: PoolHealthSnapshot = {
      timestamp: sample.timestamp,
      recommendedPoolSize: currentRecommendedSize,
      utilisation,
      score,
      color: getPoolHealthColor(score),
      probe: sample,
      scaled: sizing.scaled,
      scalingReason: sizing.reason,
    }

    addToHistory(snapshot)
    latestSnapshot = snapshot

    return snapshot
  }

  function getLatestSnapshot(): PoolHealthSnapshot | null {
    return latestSnapshot
  }

  function getMetrics(): PoolHealthMetrics {
    return aggregatePoolMetrics(history.map((h) => h.probe))
  }

  function getHistory(): ReadonlyArray<PoolHealthSnapshot> {
    return history
  }

  function reset(): void {
    history.length = 0
    latestSnapshot = null
    currentRecommendedSize = minPoolSize
  }

  return { probe, getLatestSnapshot, getMetrics, getHistory, reset }
}
