'use client'

import { useCallback, useRef, useState } from 'react'

interface UseWebSocketReconnectOptions {
  url: string
  enabled?: boolean
  reconnectDelayMs?: number
  maxReconnectAttempts?: number
  onMessage?: (data: unknown, headers: Record<string, string>) => void
  onConnected?: () => void
  onDisconnected?: () => void
  onError?: (error: string) => void
}

interface WebSocketHeaders {
  'x-last-event-id'?: string
  'x-catchup-from'?: string
}

/**
 * Hook to manage WebSocket connection with automatic reconnection and catch-up support.
 *
 * Features:
 * - Automatic reconnection with exponential backoff
 * - Sends last received event ID to server on reconnect
 * - Handles catch-up burst from server (x-catchup-from header)
 * - Deduplication through event ID headers
 */
export function useWebSocketReconnect({
  url,
  enabled = true,
  reconnectDelayMs = 5000,
  maxReconnectAttempts = 10,
  onMessage,
  onConnected,
  onDisconnected,
  onError,
}: UseWebSocketReconnectOptions) {
  const [connected, setConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimerRef = useRef<NodeJS.Timeout | undefined>()
  const reconnectAttemptsRef = useRef(0)
  const closedRef = useRef(false)
  const lastEventIdRef = useRef<string | null>(null)

  const handleError = useCallback(
    (errMsg: string) => {
      setError(errMsg)
      onError?.(errMsg)
    },
    [onError]
  )

  const connect = useCallback(() => {
    if (closedRef.current || !enabled || !url) return

    if (reconnectAttemptsRef.current > maxReconnectAttempts) {
      handleError('Max reconnection attempts exceeded')
      return
    }

    try {
      wsRef.current = new WebSocket(url)

      wsRef.current.onopen = () => {
        reconnectAttemptsRef.current = 0
        setConnected(true)
        setError(null)
        onConnected?.()

        // Send last event ID to server for catch-up logic
        if (lastEventIdRef.current && wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(
            JSON.stringify({
              type: 'sync',
              lastEventId: lastEventIdRef.current,
            })
          )
        }
      }

      wsRef.current.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)

          // Extract headers from message or from WebSocket headers
          const headers: Record<string, string> = {}
          if (event.data.includes('x-last-event-id')) {
            const match = event.data.match(/"x-last-event-id":"([^"]+)"/)
            if (match) headers['x-last-event-id'] = match[1]
          }
          if (event.data.includes('x-catchup-from')) {
            const match = event.data.match(/"x-catchup-from":"([^"]+)"/)
            if (match) headers['x-catchup-from'] = match[1]
          }

          // Update last event ID if provided
          if (data.id) {
            lastEventIdRef.current = data.id
          }

          onMessage?.(data, headers)
        } catch (err) {
          handleError(`Failed to parse message: ${err}`)
        }
      }

      wsRef.current.onclose = () => {
        wsRef.current = null
        setConnected(false)
        onDisconnected?.()

        if (!closedRef.current) {
          reconnectAttemptsRef.current += 1
          const delay = Math.min(reconnectDelayMs * Math.pow(2, reconnectAttemptsRef.current - 1), 30000)
          reconnectTimerRef.current = setTimeout(connect, delay)
        }
      }

      wsRef.current.onerror = () => {
        // Error is handled by onclose
      }
    } catch (err) {
      handleError(`WebSocket connection failed: ${err}`)
    }
  }, [url, enabled, reconnectDelayMs, maxReconnectAttempts, onMessage, onConnected, onDisconnected, handleError])

  // Initialize connection
  const setupRef = useRef(false)
  if (enabled && url && !setupRef.current && typeof window !== 'undefined') {
    setupRef.current = true
    closedRef.current = false
    connect()
  }

  // Cleanup
  const cleanup = useCallback(() => {
    closedRef.current = true
    if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current)
    if (wsRef.current) wsRef.current.close()
  }, [])

  return {
    connected,
    error,
    lastEventId: lastEventIdRef.current,
    cleanup,
  }
}
