'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { SlashingEvent, UseSlashingStreamOptions, UseSlashingStreamResult } from '@/src/types/slashing'
import { useWebSocketReconnect } from './useWebSocketReconnect'

const DEFAULT_DEDUP_WINDOW_MS = 300000 // 5 minutes
const CLEANUP_INTERVAL_MS = 60000 // Clean up every minute
const MAX_EVENTS = 1000 // Maximum events to keep in memory

interface ReceivedEventEntry {
  timestamp: number
}

function isSlashingEvent(value: unknown): value is SlashingEvent {
  if (!value || typeof value !== 'object') return false
  const obj = value as Record<string, unknown>
  return (
    typeof obj.id === 'string' &&
    typeof obj.nodeId === 'string' &&
    typeof obj.timestamp === 'number' &&
    typeof obj.amount === 'number' &&
    typeof obj.slot === 'number' &&
    typeof obj.epoch === 'number' &&
    typeof obj.seq === 'number'
  )
}

/**
 * Hook to stream slashing events from WebSocket with built-in deduplication.
 *
 * Maintains a Map<eventId, timestamp> of recently received event IDs with TTL.
 * Before adding an event to the feed:
 * 1. Check if eventId ∈ receivedIds
 * 2. If yes, skip (duplicate detected)
 * 3. If no, add to feed and add eventId to receivedIds with timestamp
 * 4. Periodically clean up expired entries (TTL = dedupWindowMs)
 *
 * This ensures the invariant: ∀ event_id: count(feed_events[event_id]) <= 1
 */
export function useSlashingStream({
  url,
  enabled = true,
  dedupWindowMs = DEFAULT_DEDUP_WINDOW_MS,
  onEvents,
}: UseSlashingStreamOptions): UseSlashingStreamResult {
  const [events, setEvents] = useState<SlashingEvent[]>([])
  const [error, setError] = useState<string | null>(null)
  const [lastEventId, setLastEventId] = useState<string | null>(null)

  // Clean up expired event IDs based on TTL
  const cleanupExpiredIds = useCallback(() => {
    const now = Date.now()
    const receivedIds = receivedIdsRef.current

    for (const [eventId, entry] of receivedIds.entries()) {
      if (now - entry.timestamp > dedupWindowMs) {
        receivedIds.delete(eventId)
      }
    }
  }, [dedupWindowMs])

  // Check if event ID has already been received
  const isDuplicate = useCallback((eventId: string): boolean => {
    return receivedIdsRef.current.has(eventId)
  }, [])

  // Add event ID to received set
  const markAsReceived = useCallback((eventId: string) => {
    receivedIdsRef.current.set(eventId, { timestamp: Date.now() })
  }, [])

  // Handle incoming slashing events
  const handleMessage = useCallback(
    (data: unknown) => {
      try {
        if (!isSlashingEvent(data)) {
          console.warn('Invalid slashing event format', data)
          return
        }

        // Check for duplicate using received event ID set
        if (isDuplicate(data.id)) {
          console.debug(`Duplicate slashing event ignored: ${data.id}`)
          return
        }

        // Mark as received and add to feed
        markAsReceived(data.id)
        setLastEventId(data.id)

        setEvents((prevEvents) => {
          // Double-check: ensure event is not already in the list
          // (React render key dedup + array filter)
          if (prevEvents.some((e) => e.id === data.id)) {
            return prevEvents
          }

          const newEvents = [data, ...prevEvents]

          // Trim to max events
          if (newEvents.length > MAX_EVENTS) {
            return newEvents.slice(0, MAX_EVENTS)
          }

          return newEvents
        })
      } catch (err) {
        const errMsg = `Failed to process slashing event: ${err}`
        console.error(errMsg)
        setError(errMsg)
      }
    },
    [isDuplicate, markAsReceived]
  )

  // WebSocket reconnect hook with catch-up support
  const { connected } = useWebSocketReconnect({
    url: enabled ? url : '',
    enabled,
    reconnectDelayMs: 5000,
    onMessage: (data) => {
      handleMessage(data)
    },
    onError: (err) => {
      setError(err)
    },
  })

  // Notify on events update
  useEffect(() => {
    onEvents?.(events)
  }, [events, onEvents])

  // Set up cleanup interval for expired event IDs
  useEffect(() => {
    if (!enabled) return

    cleanupTimerRef.current = setInterval(cleanupExpiredIds, CLEANUP_INTERVAL_MS)

    return () => {
      if (cleanupTimerRef.current) {
        clearInterval(cleanupTimerRef.current)
      }
    }
  }, [enabled, cleanupExpiredIds])

  return {
    events,
    connected,
    error,
    lastEventId,
  }
}
