import { describe, expect, it, vi } from 'vitest'
import { CacheLayer, MemoryCacheStore, RedisHttpCacheStore } from './cacheLayer'

describe('CacheLayer', () => {
  it('returns cached values within the configured TTL', async () => {
    const cache = new CacheLayer({ defaultTtlMs: 1_000, namespace: 'test' })

    await cache.set('node-health', { status: 'ok' })

    await expect(cache.get('node-health')).resolves.toEqual({ status: 'ok' })
    const metrics = await cache.snapshot()
    expect(metrics.hits).toBe(1)
    expect(metrics.hitRate).toBe(1)
  })

  it('evicts expired values and records a miss', async () => {
    vi.useFakeTimers()
    const cache = new CacheLayer({ defaultTtlMs: 100, namespace: 'test' })
    await cache.set('validators', ['a'])

    vi.advanceTimersByTime(101)

    await expect(cache.get('validators')).resolves.toBeNull()
    const metrics = await cache.snapshot()
    expect(metrics.misses).toBe(1)
    expect(metrics.evictions).toBe(1)
    vi.useRealTimers()
  })

  it('deduplicates loader calls when a value is present', async () => {
    const cache = new CacheLayer({ namespace: 'test' })
    const loader = vi.fn(async () => 'fresh')

    await expect(cache.getOrSet('config', loader)).resolves.toBe('fresh')
    await expect(cache.getOrSet('config', loader)).resolves.toBe('fresh')

    expect(loader).toHaveBeenCalledTimes(1)
  })
})

describe('MemoryCacheStore', () => {
  it('evicts least recently used entries over the size limit', async () => {
    const store = new MemoryCacheStore(1)
    const entry = { value: 'a' as const, createdAt: 0, expiresAt: 10, tags: [] }

    await store.set('one', entry)
    await store.set('two', { ...entry, value: 'b' })

    await expect(store.get('one')).resolves.toBeNull()
    await expect(store.get('two')).resolves.toMatchObject({ value: 'b' })
  })
})

describe('RedisHttpCacheStore', () => {
  it('serializes cache entries with Redis expiration', async () => {
    const calls: Array<[RequestInfo | URL, RequestInit | undefined]> = []
    const fetcher: typeof fetch = async (input, init) => {
      calls.push([input, init])
      return new Response(JSON.stringify({ result: 'OK' }), { status: 200 })
    }
    const store = new RedisHttpCacheStore({ endpoint: 'https://redis.example', token: 'secret', fetcher })

    await store.set('key', { value: 'value', createdAt: Date.now(), expiresAt: Date.now() + 2_000, tags: ['critical'] })

    expect(calls).toHaveLength(1)
    const [url, init] = calls[0]!
    expect(String(url)).toContain('/set/key/')
    expect(String(url)).toContain('EX=')
    expect(init?.headers).toMatchObject({ Authorization: 'Bearer secret' })
  })
})
