'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchSyncStatus } from '@/src/lib/api/syncStatus'
import type {
  SyncStatus,
  SyncSpeedPoint,
  PeerCountPoint,
} from '@/src/types/sync'

// ---------------------------------------------------------------------------
// Demo / fallback data
// ---------------------------------------------------------------------------

/** Deterministic demo sync state used when the API is unreachable. */
function buildDemoSyncStatus(): SyncStatus {
  const now = Date.now()
  const CURRENT = 1_950_000
  const TIP = 2_000_000
  const SPEED = 42.5

  const speedHistory: SyncSpeedPoint[] = Array.from({ length: 30 }, (_, i) => ({
    timestamp: now - (29 - i) * 10_000,
    blocksPerSecond: 30 + Math.sin(i * 0.4) * 15,
  }))

  const peerCountHistory: PeerCountPoint[] = Array.from({ length: 30 }, (_, i) => ({
    timestamp: now - (29 - i) * 10_000,
    peerCount: 20 + Math.floor(Math.sin(i * 0.3) * 5),
  }))

  // Spread peer heights around the network tip to produce an interesting histogram.
  const peerHeights: number[] = [
    ...Array.from({ length: 4 }, () => TIP - 5_000 + Math.floor(Math.random() * 5_000)),
    ...Array.from({ length: 8 }, () => TIP - 2_000 + Math.floor(Math.random() * 2_000)),
    ...Array.from({ length: 12 }, () => TIP - 500 + Math.floor(Math.random() * 500)),
    TIP,
    TIP,
    TIP + 1,
  ]

  return {
    currentHeight: CURRENT,
    networkTipHeight: TIP,
    bestPeerHeight: TIP + 1,
    downloadSpeedBps: SPEED,
    estimatedSecondsRemaining: Math.round((TIP - CURRENT) / SPEED),
    peerCount: 25,
    peerHeights,
    phase: 'syncing',
    lastProgressAt: now - 2_000,
    speedHistory,
    peerCountHistory,
  }
}

/** Demo stall state (used when nodeId ends with "stall" for testing). */
function buildDemoStallStatus(): SyncStatus {
  const base = buildDemoSyncStatus()
  const now = Date.now()
  return {
    ...base,
    phase: 'stalled',
    stallReason: 'slow_peer',
    stallMessage: 'No block progress for 60 s — best peer is not advancing.',
    lastProgressAt: now - 65_000,
    downloadSpeedBps: 0,
    estimatedSecondsRemaining: null,
  }
}

// ---------------------------------------------------------------------------
// WebSocket message shape
// ---------------------------------------------------------------------------

interface WSSyncUpdate {
  type: 'sync-status-update'
  data: SyncStatus
}

// ---------------------------------------------------------------------------
// Hook options / return type
// ---------------------------------------------------------------------------

export interface UseSyncStatusOptions {
  /** WebSocket URL for live updates, e.g. "wss://node.example.com/ws/sync". */
  wsUrl?: string
  /** Poll interval (ms) when WebSocket is unavailable; 0 = no polling. */
  pollIntervalMs?: number
  /** Pass true to force stall demo mode (useful in Storybook / testing). */
  simulateStall?: boolean
}

export interface UseSyncStatusReturn {
  syncStatus: SyncStatus | null
  isLoading: boolean
  error: string | null
  /** Whether the WebSocket connection is live. */
  wsConnected: boolean
  /** Trigger a manual refresh of the REST snapshot. */
  refresh: () => void
}

/**
 * Loads initial sync state via REST (GET /api/v1/node/sync-status) and keeps
 * it current through a WebSocket subscription. Falls back to deterministic
 * demo data when the endpoint is unreachable, matching the project convention.
 *
 * A stall is surfaced through `syncStatus.phase === 'stalled'` together with
 * `stallReason` and `stallMessage`. The 60-second stall timer is authoritative
 * on the server; the client reflects whatever phase the server reports.
 */
export function useSyncStatus({
  wsUrl,
  pollIntervalMs = 0,
  simulateStall = false,
}: UseSyncStatusOptions = {}): UseSyncStatusReturn {
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [wsConnected, setWsConnected] = useState(false)

  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>()
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | undefined>()
  const mountedRef = useRef(true)
  const reconnectAttemptsRef = useRef(0)

  // ------------------------------------------------------------------
  // REST fetch
  // ------------------------------------------------------------------

  const loadRest = useCallback(async () => {
    try {
      const data = await fetchSyncStatus()
      if (mountedRef.current) {
        setSyncStatus(simulateStall ? buildDemoStallStatus() : data)
        setError(null)
      }
    } catch {
      // API unreachable — fall back to demo data so the UI is always usable.
      if (mountedRef.current) {
        setSyncStatus(simulateStall ? buildDemoStallStatus() : buildDemoSyncStatus())
        setError(null)
      }
    } finally {
      if (mountedRef.current) setIsLoading(false)
    }
  }, [simulateStall])

  // ------------------------------------------------------------------
  // WebSocket
  // ------------------------------------------------------------------

  const connectWs = useCallback(() => {
    if (!wsUrl || !mountedRef.current) return

    if (reconnectAttemptsRef.current > 10) {
      // Give up silently; REST polling (if enabled) is the fallback.
      return
    }

    try {
      const ws = new WebSocket(wsUrl)
      wsRef.current = ws

      ws.onopen = () => {
        if (!mountedRef.current) { ws.close(); return }
        reconnectAttemptsRef.current = 0
        setWsConnected(true)
      }

      ws.onmessage = (event) => {
        if (!mountedRef.current) return
        try {
          const msg: WSSyncUpdate = JSON.parse(event.data as string)
          if (msg.type === 'sync-status-update') {
            setSyncStatus(simulateStall ? buildDemoStallStatus() : msg.data)
          }
        } catch {
          // Ignore malformed frames
        }
      }

      ws.onerror = () => {
        // onclose handles reconnect
      }

      ws.onclose = () => {
        wsRef.current = null
        if (!mountedRef.current) return
        setWsConnected(false)
        reconnectAttemptsRef.current += 1
        const delay = Math.min(5_000 * Math.pow(2, reconnectAttemptsRef.current - 1), 30_000)
        reconnectTimerRef.current = setTimeout(connectWs, delay)
      }
    } catch {
      // new WebSocket() can throw in some environments (SSR, tests)
    }
  }, [wsUrl, simulateStall])

  // ------------------------------------------------------------------
  // Mount / cleanup
  // ------------------------------------------------------------------

  useEffect(() => {
    mountedRef.current = true

    // 1. Load REST snapshot first (always).
    loadRest()

    // 2. Open WebSocket for live updates.
    if (wsUrl) connectWs()

    // 3. Optional polling fallback.
    if (pollIntervalMs > 0) {
      pollTimerRef.current = setInterval(loadRest, pollIntervalMs)
    }

    return () => {
      mountedRef.current = false
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current)
      if (pollTimerRef.current) clearInterval(pollTimerRef.current)
      if (wsRef.current) {
        wsRef.current.onclose = null // prevent reconnect on intentional close
        wsRef.current.close()
        wsRef.current = null
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wsUrl, pollIntervalMs])

  return {
    syncStatus,
    isLoading,
    error,
    wsConnected,
    refresh: loadRest,
  }
}
