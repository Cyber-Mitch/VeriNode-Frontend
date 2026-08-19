'use client'

import { useCallback } from 'react'
import { webSocketManager } from '@/services/webSocketManager'
import { useWebSocketHealthStore } from '@/store/webSocketHealthSlice'

export function useWebSocketHealth() {
  const connections = useWebSocketHealthStore((s) =>
    Object.values(s.connections).sort((a, b) => a.connectionId.localeCompare(b.connectionId)),
  )

  const tier3Connections = connections.filter((c) => c.tierStatus.tier === 3 && !c.autoReconnectEnabled)

  const retry = useCallback((connectionId: string) => {
    webSocketManager.retryConnection(connectionId)
  }, [])

  return { connections, tier3Connections, retry }
}

