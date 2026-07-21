'use client'

import { useEffect, useRef } from 'react'
import {
  useNodeStatus,
  type AttestationStatus,
  type NodeStatusEvent,
  type UseNodeStatusResult,
} from '@/src/hooks/useNodeStatus'

const DEDUP_WINDOW_MS = 50
const RECONNECT_DELAY_MS = 5000

interface UseNodeStreamOptions {
  url: string
  enabled?: boolean
  /** Dedup/flush window in ms (default 50). */
  dedupWindowMs?: number
}

function isAttestationStatus(value: unknown): value is AttestationStatus {
  return value === 'pending' || value === 'attested' || value === 'slashed'
}

function parseEvent(raw: unknown): NodeStatusEvent | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  if (typeof o.nodeId !== 'string' || typeof o.seq !== 'number' || !isAttestationStatus(o.status)) {
    return null
  }
  return {
    nodeId: o.nodeId,
    status: o.status,
    seq: o.seq,
    ts: typeof o.ts === 'number' ? o.ts : undefined,
  }
}

/**
 * WebSocket node-status stream with a deduplication buffer.
 *
 * Incoming events (up to ~30/s) are buffered for `dedupWindowMs` (50 ms),
 * keeping only the highest-seq event per node. Each window flushes once,
 * applying all buffered nodes in a single reducer dispatch. This caps the
 * update rate at the unique-node rate and, combined with the reducer's
 * sequence/transition guards, eliminates indicator flicker from rapid
 * back-and-forth transitions.
 */
export function useNodeStream({
  url,
  enabled = true,
  dedupWindowMs = DEDUP_WINDOW_MS,
}: UseNodeStreamOptions): UseNodeStatusResult {
  const status = useNodeStatus()
  const { applyEvents } = status
  const bufferRef = useRef<Map<string, NodeStatusEvent>>(new Map())

  useEffect(() => {
    if (!enabled || !url) return

    const bufferMap = bufferRef.current
    let ws: WebSocket | null = null
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined
    let closed = false

    const flush = () => {
      if (bufferMap.size === 0) return
      const events = [...bufferMap.values()]
      bufferMap.clear()
      applyEvents(events)
    }

    const enqueue = (event: NodeStatusEvent) => {
      const existing = bufferMap.get(event.nodeId)
      // Keep only the latest (highest-seq) event per node within the window.
      if (!existing || event.seq > existing.seq) bufferMap.set(event.nodeId, event)
    }

    const connect = () => {
      if (closed) return
      ws = new WebSocket(url)
      ws.onmessage = (e) => {
        try {
          const parsed = parseEvent(JSON.parse(e.data))
          if (parsed) enqueue(parsed)
        } catch {
          // Ignore malformed frames.
        }
      }
      ws.onclose = () => {
        ws = null
        if (!closed) reconnectTimer = setTimeout(connect, RECONNECT_DELAY_MS)
      }
      ws.onerror = () => {
        // The close handler performs reconnection.
      }
    }

    connect()
    const flushTimer = setInterval(flush, dedupWindowMs)

    return () => {
      closed = true
      clearInterval(flushTimer)
      if (reconnectTimer) clearTimeout(reconnectTimer)
      if (ws) ws.close()
      bufferMap.clear()
    }
  }, [url, enabled, dedupWindowMs, applyEvents])

  return status
}
