import { create } from 'zustand'
import type { WebSocketConnectionHealthSummary } from '@/types/webSocketHealth'

interface WebSocketHealthState {
  connections: Record<string, WebSocketConnectionHealthSummary>
  upsertConnectionHealth: (summary: WebSocketConnectionHealthSummary) => void
  removeConnectionHealth: (connectionId: string) => void
  clearAll: () => void
}

export const useWebSocketHealthStore = create<WebSocketHealthState>((set) => ({
  connections: {},
  upsertConnectionHealth: (summary) =>
    set((s) => ({
      connections: {
        ...s.connections,
        [summary.connectionId]: summary,
      },
    })),
  removeConnectionHealth: (connectionId) =>
    set((s) => {
      if (!s.connections[connectionId]) return s
      const next = { ...s.connections }
      delete next[connectionId]
      return { connections: next }
    }),
  clearAll: () => set({ connections: {} }),
}))

