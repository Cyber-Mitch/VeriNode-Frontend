import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { webSocketManager } from '@/src/services/webSocketManager'

class MockWebSocket {
  static OPEN = 1
  static CONNECTING = 0

  static instances: MockWebSocket[] = []

  readyState = MockWebSocket.OPEN
  onopen: ((ev: Event) => void) | null = null
  onclose: ((ev: CloseEvent) => void) | null = null
  onmessage: ((ev: MessageEvent) => void) | null = null
  onerror: ((ev: Event) => void) | null = null

  constructor(public url: string) {
    MockWebSocket.instances.push(this)
    setTimeout(() => this.onopen?.(new Event('open')), 0)
  }

  send() {
    // no-op
  }

  close() {
    this.readyState = 3
    // no-op: tests trigger close manually via `onclose`
  }

  triggerClose(code: number, reason?: string) {
    this.readyState = 3
    this.onclose?.(({ code, reason } as unknown) as CloseEvent)
  }
}

describe('webSocketManager (tiered reconnection + tier-3 disable)', () => {
  const connectionId = 'test-connection'
  const url = 'ws://localhost/ws'

  const originalWebSocket = globalThis.WebSocket

  beforeEach(() => {
    vi.useFakeTimers()
    MockWebSocket.instances = []
    globalThis.WebSocket = MockWebSocket as unknown as typeof WebSocket
    vi.spyOn(Math, 'random').mockReturnValue(0)
  })

  afterEach(() => {
    webSocketManager.retryConnection(connectionId) // best-effort cleanup path
    // Release all active connections if they still exist.
    // (The manager will stop ticking once idle.)
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
    vi.restoreAllMocks()
    globalThis.WebSocket = originalWebSocket
  })

  it('reconnects immediately for Tier 1 (1000) close code', () => {
    const release = webSocketManager.acquireConnection({
      connectionId,
      url,
      enabled: true,
    })

    expect(MockWebSocket.instances.length).toBe(1)
    const ws = MockWebSocket.instances[0]
    ws.triggerClose(1000, 'normal')

    // Tier 1 reconnect delay is immediate (0ms).
    vi.runOnlyPendingTimers()

    expect(MockWebSocket.instances.length).toBe(2)

    release()
  })

  it('escalates to Tier 2 after 3 Tier 1 reconnect attempts, then backs off (5s)', () => {
    const release = webSocketManager.acquireConnection({
      connectionId,
      url,
      enabled: true,
    })

    expect(MockWebSocket.instances.length).toBe(1)

    for (let i = 0; i < 3; i++) {
      const ws = MockWebSocket.instances[MockWebSocket.instances.length - 1]
      ws.triggerClose(1000)
      vi.runOnlyPendingTimers()
    }

    // After 3 attempts, tier1ReconnectAttempts is 3.
    const ws4 = MockWebSocket.instances[MockWebSocket.instances.length - 1]
    ws4.triggerClose(1000)

    // No new socket before the 5s Tier 2 backoff.
    vi.advanceTimersByTime(4_999)
    expect(MockWebSocket.instances.length).toBe(4)

    vi.advanceTimersByTime(1)
    expect(MockWebSocket.instances.length).toBe(5)

    release()
  })

  it('disables auto-reconnect for Tier 3 (auth codes 4000–4009) and retries only on manual call', () => {
    const release = webSocketManager.acquireConnection({
      connectionId,
      url,
      enabled: true,
    })

    expect(MockWebSocket.instances.length).toBe(1)
    const ws = MockWebSocket.instances[0]
    ws.triggerClose(4001, 'auth-error')

    vi.advanceTimersByTime(60_000)
    expect(MockWebSocket.instances.length).toBe(1)

    webSocketManager.retryConnection(connectionId)
    expect(MockWebSocket.instances.length).toBe(2)

    release()
  })
})

