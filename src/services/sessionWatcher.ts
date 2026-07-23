export interface WalletProviders {
  freighter?: { isConnected: () => boolean }
  lobstr?: { isConnected: () => boolean }
  xbull?: { isConnected: () => boolean }
  albedo?: { isConnected: () => boolean }
}

export type WalletType = keyof WalletProviders

export interface SessionEventMap {
  disconnected: { walletType: WalletType }
  reconnected: { walletType: WalletType }
}

export type SessionEventListener<T extends keyof SessionEventMap> =
  (event: SessionEventMap[T]) => void

const POLL_INTERVAL = 2000
const MAX_POLL_MS = 10
const HEARTBEAT_CACHE_MS = 30000
const HEARTBEAT_URL = "/api/v1/auth/heartbeat"

export class SessionWatcher {
  private providers: WalletProviders
  private prevConnected: Map<WalletType, boolean> = new Map()
  private intervalId: ReturnType<typeof setInterval> | null = null
  private listeners = new Map<string, Set<(...args: unknown[]) => void>>()
  private heartbeatCache: { ok: boolean; timestamp: number } | null = null

  constructor(providers: WalletProviders) {
    this.providers = providers
    for (const key of Object.keys(providers) as WalletType[]) {
      this.prevConnected.set(key, true)
    }
  }

  on<T extends keyof SessionEventMap>(
    event: T,
    listener: SessionEventListener<T>,
  ) {
    if (!this.listeners.has(event as string)) {
      this.listeners.set(event as string, new Set())
    }
    this.listeners.get(event as string)!.add(listener as (...args: unknown[]) => void)
    return () => {
      this.listeners.get(event as string)?.delete(listener as (...args: unknown[]) => void)
    }
  }

  private emit<T extends keyof SessionEventMap>(
    event: T,
    data: SessionEventMap[T],
  ) {
    this.listeners.get(event as string)?.forEach((listener) => listener(data))
  }

  start() {
    if (this.intervalId) return
    this.intervalId = setInterval(() => this.poll(), POLL_INTERVAL)
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }
  }

  get isRunning() {
    return this.intervalId !== null
  }

  recheckNow() {
    this.poll()
  }

  private async poll() {
    for (const key of Object.keys(this.providers) as WalletType[]) {
      const provider = this.providers[key]
      if (!provider) continue

      const t0 = performance.now()
      let connected: boolean

      if (typeof provider.isConnected === "function") {
        connected = provider.isConnected()
      } else {
        connected = await this.fallbackHeartbeat()
      }

      const elapsed = performance.now() - t0
      if (elapsed > MAX_POLL_MS) {
        console.warn(
          `[SessionWatcher] ${key}.isConnected() took ${elapsed.toFixed(1)}ms (threshold: ${MAX_POLL_MS}ms)`,
        )
      }

      const prev = this.prevConnected.get(key) ?? true
      if (prev && !connected) {
        this.prevConnected.set(key, false)
        this.emit("disconnected", { walletType: key })
      } else if (!prev && connected) {
        this.prevConnected.set(key, true)
        this.emit("reconnected", { walletType: key })
      }
    }
  }

  private async fallbackHeartbeat(): Promise<boolean> {
    const now = Date.now()
    if (this.heartbeatCache && now - this.heartbeatCache.timestamp < HEARTBEAT_CACHE_MS) {
      return this.heartbeatCache.ok
    }

    try {
      const res = await fetch(HEARTBEAT_URL, { credentials: "include" })
      const ok = res.status !== 401
      this.heartbeatCache = { ok, timestamp: now }
      return ok
    } catch {
      this.heartbeatCache = { ok: false, timestamp: now }
      return false
    }
  }
}
