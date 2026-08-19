function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export interface WebSocketHealthScoreComponents {
  uptimeRatioLast60s: number
  avgMessageLatencyMs: number
  consecutiveReconnects: number
  uptimeScore: number
  latencyScore: number
  reconnectScore: number
  totalScore: number
}

export interface ComputeWebSocketHealthScoreParams {
  /** Fraction of the last 60 seconds where the connection was open (0–1). */
  uptimeRatioLast60s: number
  /** Average message latency over the last 60 seconds (ms). */
  avgMessageLatencyMs: number
  /** Consecutive reconnect attempts since the last stable open. */
  consecutiveReconnects: number
}

/**
 * Health score formula (0–100) per issue spec:
 *   50 × uptimeRatio_last_60s
 * + 30 × (avg_message_latency_ms / 1000, clamped 0–1 inverted)
 * + 20 × (consecutive_reconnects, decaying: max at 0 reconnects)
 *
 * The decay curve for reconnects is anchored to the Tier 1 escalation bound:
 * Tier 1 allows up to 3 immediate attempts before escalating to Tier 2, so
 * the reconnect sub-score linearly decays to 0 by `consecutiveReconnects = 3`.
 */
export function computeWebSocketHealthScore({
  uptimeRatioLast60s,
  avgMessageLatencyMs,
  consecutiveReconnects,
}: ComputeWebSocketHealthScoreParams): WebSocketHealthScoreComponents {
  const uptimeRatio = clamp01(uptimeRatioLast60s)
  const latencyRatio = clamp(avgMessageLatencyMs / 1_000, 0, 1)
  const latencySubScore = 1 - latencyRatio // inverted: lower latency → higher health

  const reconnectDecayAtZero = 3
  const reconnectSubScore = Math.max(0, 1 - consecutiveReconnects / reconnectDecayAtZero)

  const uptimeScore = 50 * uptimeRatio
  const latencyScore = 30 * latencySubScore
  const reconnectScore = 20 * reconnectSubScore
  const totalScore = clamp(Math.round(uptimeScore + latencyScore + reconnectScore), 0, 100)

  return {
    uptimeRatioLast60s: uptimeRatio,
    avgMessageLatencyMs,
    consecutiveReconnects,
    uptimeScore,
    latencyScore,
    reconnectScore,
    totalScore,
  }
}

