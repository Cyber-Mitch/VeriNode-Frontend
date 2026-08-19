export type WebSocketTier = 1 | 2 | 3

export type WebSocketTierStatus = {
  tier: WebSocketTier
  /** Human-readable classification label. */
  label: string
}

export interface WebSocketCloseInfo {
  closeCode?: number
  reason?: string
  tierStatus: WebSocketTierStatus
}

export interface WebSocketHealthSnapshot {
  /** Unix timestamp (ms) for this 5s health snapshot tick. */
  timestamp: number
  uptimeRatioLast60s: number
  avgMessageLatencyMs: number
  consecutiveReconnects: number
  connected: boolean
  healthScore: number
  /** Tier derived from the most recent close classification. */
  tierStatus: WebSocketTierStatus
  lastClose?: WebSocketCloseInfo
  /**
   * Latency points used for sparkline rendering.
   * Stores average latency over the last 60 seconds at this tick.
   */
  avgLatencyForSparklineMs: number
}

export interface WebSocketConnectionHealthSummary {
  connectionId: string
  url: string
  connected: boolean
  healthScore: number
  tierStatus: WebSocketTierStatus
  uptimeRatioLast60s: number
  avgMessageLatencyMs: number
  consecutiveReconnects: number
  reconnectAttempts: number
  autoReconnectEnabled: boolean
  lastClose?: WebSocketCloseInfo
  /** 1-minute latency sparkline (12 points at 5s interval), oldest→newest. */
  latencySparklineMs: number[]
  /** Most recent snapshot time. */
  lastSnapshotAt: number
}

