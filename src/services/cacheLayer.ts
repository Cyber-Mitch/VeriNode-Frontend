export type CacheValue = string | number | boolean | null | CacheValue[] | { [key: string]: CacheValue }

export interface CacheSetOptions {
  ttlMs?: number
  tags?: string[]
}

export interface CacheEntry<T = CacheValue> {
  value: T
  createdAt: number
  expiresAt: number
  tags: string[]
}

export interface CacheMetricsSnapshot {
  hits: number
  misses: number
  sets: number
  deletes: number
  evictions: number
  errors: number
  size: number
  hitRate: number
  p99LatencyMs: number
}

export interface CacheStore {
  get<T extends CacheValue>(key: string): Promise<CacheEntry<T> | null>
  set<T extends CacheValue>(key: string, entry: CacheEntry<T>): Promise<void>
  delete(key: string): Promise<void>
  clear(): Promise<void>
  size(): Promise<number>
}

export interface CacheLayerOptions {
  defaultTtlMs?: number
  maxEntries?: number
  namespace?: string
  store?: CacheStore
  onError?: (error: unknown) => void
}

const DEFAULT_TTL_MS = 5 * 60 * 1000
const DEFAULT_MAX_ENTRIES = 1_000
const LATENCY_SAMPLE_LIMIT = 1_024

function isExpired(entry: CacheEntry, now = Date.now()) {
  return now >= entry.expiresAt
}

function percentile(samples: number[], p: number) {
  if (samples.length === 0) return 0
  const sorted = [...samples].sort((a, b) => a - b)
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)
  return sorted[index]
}

function namespaced(namespace: string, key: string) {
  return namespace ? `${namespace}:${key}` : key
}

export class MemoryCacheStore implements CacheStore {
  private readonly entries = new Map<string, CacheEntry>()

  constructor(private readonly maxEntries = DEFAULT_MAX_ENTRIES) {}

  async get<T extends CacheValue>(key: string): Promise<CacheEntry<T> | null> {
    const entry = this.entries.get(key)
    if (!entry) return null
    this.entries.delete(key)
    this.entries.set(key, entry)
    return entry as CacheEntry<T>
  }

  async set<T extends CacheValue>(key: string, entry: CacheEntry<T>): Promise<void> {
    if (this.entries.has(key)) this.entries.delete(key)
    this.entries.set(key, entry)
    while (this.entries.size > this.maxEntries) {
      const oldestKey = this.entries.keys().next().value
      if (oldestKey === undefined) break
      this.entries.delete(oldestKey)
    }
  }

  async delete(key: string): Promise<void> {
    this.entries.delete(key)
  }

  async clear(): Promise<void> {
    this.entries.clear()
  }

  async size(): Promise<number> {
    return this.entries.size
  }
}

export interface RedisHttpCacheStoreOptions {
  endpoint: string
  token?: string
  fetcher?: typeof fetch
}

/**
 * Redis-backed cache store for deployments that expose Redis through a REST
 * gateway (for example Upstash or an internal cache service). Values are stored
 * as JSON envelopes so TTL metadata is shared with the in-memory layer.
 */
export class RedisHttpCacheStore implements CacheStore {
  private readonly fetcher: typeof fetch

  constructor(private readonly options: RedisHttpCacheStoreOptions) {
    this.fetcher = options.fetcher ?? fetch
  }

  async get<T extends CacheValue>(key: string): Promise<CacheEntry<T> | null> {
    const response = await this.request(`/get/${encodeURIComponent(key)}`, { method: 'GET' })
    if (!response.ok) throw new Error(`Redis GET failed with ${response.status}`)
    const payload = await response.json() as { result?: string | null }
    if (!payload.result) return null
    return JSON.parse(payload.result) as CacheEntry<T>
  }

  async set<T extends CacheValue>(key: string, entry: CacheEntry<T>): Promise<void> {
    const ttlSeconds = Math.max(1, Math.ceil((entry.expiresAt - Date.now()) / 1000))
    const encodedKey = encodeURIComponent(key)
    const encodedValue = encodeURIComponent(JSON.stringify(entry))
    const response = await this.request(`/set/${encodedKey}/${encodedValue}?EX=${ttlSeconds}`, { method: 'POST' })
    if (!response.ok) throw new Error(`Redis SET failed with ${response.status}`)
  }

  async delete(key: string): Promise<void> {
    const response = await this.request(`/del/${encodeURIComponent(key)}`, { method: 'POST' })
    if (!response.ok) throw new Error(`Redis DEL failed with ${response.status}`)
  }

  async clear(): Promise<void> {
    throw new Error('RedisHttpCacheStore.clear is intentionally unsupported; invalidate keys by namespace or tag instead')
  }

  async size(): Promise<number> {
    return 0
  }

  private request(path: string, init: RequestInit) {
    return this.fetcher(`${this.options.endpoint.replace(/\/$/, '')}${path}`, {
      ...init,
      headers: {
        Authorization: this.options.token ? `Bearer ${this.options.token}` : '',
        ...init.headers,
      },
    })
  }
}

export class CacheLayer {
  private readonly store: CacheStore
  private readonly defaultTtlMs: number
  private readonly namespace: string
  private readonly onError?: (error: unknown) => void
  private readonly latencies: number[] = []
  private metrics = { hits: 0, misses: 0, sets: 0, deletes: 0, evictions: 0, errors: 0 }

  constructor(options: CacheLayerOptions = {}) {
    this.defaultTtlMs = options.defaultTtlMs ?? DEFAULT_TTL_MS
    this.namespace = options.namespace ?? 'verinode'
    this.store = options.store ?? new MemoryCacheStore(options.maxEntries ?? DEFAULT_MAX_ENTRIES)
    this.onError = options.onError
  }

  async get<T extends CacheValue>(key: string): Promise<T | null> {
    return this.measure(async () => {
      try {
        const entry = await this.store.get<T>(namespaced(this.namespace, key))
        if (!entry) {
          this.metrics.misses += 1
          return null
        }
        if (isExpired(entry)) {
          this.metrics.misses += 1
          this.metrics.evictions += 1
          await this.store.delete(namespaced(this.namespace, key))
          return null
        }
        this.metrics.hits += 1
        return entry.value
      } catch (error) {
        this.recordError(error)
        return null
      }
    })
  }

  async set<T extends CacheValue>(key: string, value: T, options: CacheSetOptions = {}): Promise<void> {
    return this.measure(async () => {
      const now = Date.now()
      const ttlMs = Math.max(1, options.ttlMs ?? this.defaultTtlMs)
      try {
        await this.store.set(namespaced(this.namespace, key), {
          value,
          createdAt: now,
          expiresAt: now + ttlMs,
          tags: options.tags ?? [],
        })
        this.metrics.sets += 1
      } catch (error) {
        this.recordError(error)
      }
    })
  }

  async delete(key: string): Promise<void> {
    return this.measure(async () => {
      try {
        await this.store.delete(namespaced(this.namespace, key))
        this.metrics.deletes += 1
      } catch (error) {
        this.recordError(error)
      }
    })
  }

  async getOrSet<T extends CacheValue>(key: string, loader: () => Promise<T>, options: CacheSetOptions = {}): Promise<T> {
    const cached = await this.get<T>(key)
    if (cached !== null) return cached
    const value = await loader()
    await this.set(key, value, options)
    return value
  }

  async snapshot(): Promise<CacheMetricsSnapshot> {
    const attempts = this.metrics.hits + this.metrics.misses
    return {
      ...this.metrics,
      size: await this.store.size(),
      hitRate: attempts === 0 ? 0 : this.metrics.hits / attempts,
      p99LatencyMs: percentile(this.latencies, 99),
    }
  }

  private async measure<T>(fn: () => Promise<T>): Promise<T> {
    const started = performance.now()
    try {
      return await fn()
    } finally {
      this.latencies.push(performance.now() - started)
      if (this.latencies.length > LATENCY_SAMPLE_LIMIT) this.latencies.shift()
    }
  }

  private recordError(error: unknown) {
    this.metrics.errors += 1
    this.onError?.(error)
  }
}

export const cacheLayer = new CacheLayer({
  defaultTtlMs: Number(process.env.NEXT_PUBLIC_CACHE_TTL_MS ?? DEFAULT_TTL_MS),
  namespace: process.env.NEXT_PUBLIC_CACHE_NAMESPACE ?? 'verinode',
})
