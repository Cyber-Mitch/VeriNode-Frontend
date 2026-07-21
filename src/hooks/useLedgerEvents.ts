'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import type { RawLedgerEvent } from '@/src/types/ledgerEvents'

interface UseLedgerEventsOptions {
  /** WebSocket URL streaming raw ledger events as JSON `RawLedgerEvent`s. */
  url?: string
  enabled?: boolean
  /** Ring-buffer cap so the dashboard never grows unbounded. */
  maxEvents?: number
}

interface UseLedgerEventsResult {
  events: RawLedgerEvent[]
  connected: boolean
  error: string | null
  /** Manually inject an event (used by the RPC poller / tests). */
  push: (event: RawLedgerEvent) => void
  clear: () => void
}

const DEFAULT_MAX_EVENTS = 100

let autoSeq = 0

function normalize(raw: Partial<RawLedgerEvent>): RawLedgerEvent | null {
  if (!raw || !Array.isArray(raw.topics) || typeof raw.body !== 'string') return null
  return {
    id: raw.id ?? `evt-${raw.ledgerSeq ?? 'x'}-${autoSeq++}`,
    topics: raw.topics,
    body: raw.body,
    ledgerSeq: raw.ledgerSeq,
    timestamp: raw.timestamp ?? Date.now(),
  }
}

/**
 * Streams raw Soroban contract log events (hex topics + base64 body) from a
 * WebSocket source into a bounded, newest-first buffer. Decoding is handled
 * separately by {@link useDecodedLedgerEvents} so this hook stays cheap and the
 * decode work can be memoized.
 */
export function useLedgerEvents({
  url,
  enabled = true,
  maxEvents = DEFAULT_MAX_EVENTS,
}: UseLedgerEventsOptions = {}): UseLedgerEventsResult {
  const [events, setEvents] = useState<RawLedgerEvent[]>([])
  const [connected, setConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const wsRef = useRef<WebSocket | null>(null)

  const push = useCallback(
    (event: RawLedgerEvent) => {
      const normalized = normalize(event)
      if (!normalized) return
      setEvents((prev) => [normalized, ...prev].slice(0, maxEvents))
    },
    [maxEvents],
  )

  const clear = useCallback(() => setEvents([]), [])

  useEffect(() => {
    if (!enabled || !url) return

    const ws = new WebSocket(url)
    wsRef.current = ws

    // Connection state is driven entirely by socket callbacks (never set
    // synchronously in the effect body), including the close fired by cleanup.
    ws.onopen = () => setConnected(true)
    ws.onerror = () => setError('Ledger event stream error')
    ws.onclose = () => setConnected(false)
    ws.onmessage = (msg) => {
      try {
        const parsed = JSON.parse(msg.data) as Partial<RawLedgerEvent>
        const normalized = normalize(parsed)
        if (normalized) {
          setEvents((prev) => [normalized, ...prev].slice(0, maxEvents))
        }
      } catch {
        // Ignore malformed frames; a single bad message shouldn't kill the feed.
      }
    }

    return () => {
      ws.close()
      wsRef.current = null
    }
  }, [url, enabled, maxEvents])

  return { events, connected, error, push, clear }
}
