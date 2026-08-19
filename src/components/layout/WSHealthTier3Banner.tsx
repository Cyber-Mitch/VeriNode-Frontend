'use client'

import { useWebSocketHealth } from '@/src/hooks/useWebSocketHealth'

export function WSHealthTier3Banner() {
  const { tier3Connections, retry } = useWebSocketHealth()

  if (tier3Connections.length === 0) return null

  return (
    <div
      role="alert"
      aria-live="polite"
      className="sticky top-0 z-50 w-full border-b border-red-300 bg-red-50/90 shadow-sm"
    >
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-2 text-sm">
        <div className="flex items-center gap-3">
          <span className="inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-red-500" aria-hidden="true" />
          <div className="text-red-800">
            {tier3Connections.length} WebSocket connection{tier3Connections.length !== 1 ? 's' : ''} need manual retry.
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {tier3Connections.slice(0, 3).map((c) => (
            <button
              key={c.connectionId}
              type="button"
              onClick={() => retry(c.connectionId)}
              className="rounded-lg border border-red-300 bg-white px-3 py-1 text-xs font-semibold text-red-700 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-400/30"
            >
              Retry
            </button>
          ))}
          {tier3Connections.length > 3 && (
            <span className="text-xs text-red-800/70">+{tier3Connections.length - 3} more</span>
          )}
        </div>
      </div>
    </div>
  )
}

