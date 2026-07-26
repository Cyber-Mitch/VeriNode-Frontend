import { describe, expect, it } from 'vitest'
import {
  consumeFromTokenBucket,
  createPerTenantRateLimiter,
  toRateLimitHeaders,
} from '../rateLimiter'

describe('consumeFromTokenBucket', () => {
  it('allows requests while tokens are available', () => {
    const outcome = consumeFromTokenBucket(
      { tokens: 5, updatedAtMs: 0 },
      { capacity: 10, refillRatePerSecond: 1 },
      3,
      0,
    )

    expect(outcome.allowed).toBe(true)
    expect(outcome.state.tokens).toBe(2)
    expect(outcome.retryAfterMs).toBe(0)
  })

  it('refills tokens based on elapsed time and caps at capacity', () => {
    const outcome = consumeFromTokenBucket(
      { tokens: 0, updatedAtMs: 0 },
      { capacity: 10, refillRatePerSecond: 2 },
      1,
      6_000,
    )

    expect(outcome.allowed).toBe(true)
    expect(outcome.state.tokens).toBe(9)
  })

  it('returns retry timing when the bucket is empty', () => {
    const outcome = consumeFromTokenBucket(
      { tokens: 0, updatedAtMs: 0 },
      { capacity: 10, refillRatePerSecond: 2 },
      4,
      0,
    )

    expect(outcome.allowed).toBe(false)
    expect(outcome.retryAfterMs).toBe(2_000)
  })
})

describe('PerTenantRateLimiter', () => {
  it('isolates token buckets per tenant', () => {
    const limiter = createPerTenantRateLimiter({ defaultPolicy: { capacity: 1, refillRatePerSecond: 1 } })

    expect(limiter.check({ tenantId: 'tenant-a', nowMs: 0 }).allowed).toBe(true)
    expect(limiter.check({ tenantId: 'tenant-a', nowMs: 0 }).allowed).toBe(false)
    expect(limiter.check({ tenantId: 'tenant-b', nowMs: 0 }).allowed).toBe(true)
  })

  it('supports tenant-specific policies and route scopes', () => {
    const limiter = createPerTenantRateLimiter({
      defaultPolicy: { capacity: 1, refillRatePerSecond: 1 },
      tenantPolicies: [{ tenantId: 'enterprise', capacity: 3, refillRatePerSecond: 10 }],
    })

    expect(limiter.check({ tenantId: 'enterprise', scope: 'read', nowMs: 0 }).remaining).toBe(2)
    expect(limiter.check({ tenantId: 'enterprise', scope: 'write', nowMs: 0 }).remaining).toBe(2)
    expect(limiter.check({ tenantId: 'basic', scope: 'read', nowMs: 0 }).remaining).toBe(0)
  })

  it('records metrics for monitoring and alerting', () => {
    const limiter = createPerTenantRateLimiter({ defaultPolicy: { capacity: 1, refillRatePerSecond: 1 } })

    limiter.check({ tenantId: 'tenant-a', nowMs: 0 })
    limiter.check({ tenantId: 'tenant-a', nowMs: 0 })

    expect(limiter.getMetricsSnapshot()).toEqual({
      allowed: 1,
      limited: 1,
      buckets: 1,
      perTenant: { 'tenant-a': { allowed: 1, limited: 1 } },
    })
  })

  it('generates standard rate limit response headers', () => {
    const limiter = createPerTenantRateLimiter({ defaultPolicy: { capacity: 1, refillRatePerSecond: 1 } })
    const limited = limiter.check({ tenantId: 'tenant-a', nowMs: 0 })

    expect(toRateLimitHeaders(limited)).toEqual({
      'X-RateLimit-Limit': '1',
      'X-RateLimit-Remaining': '0',
      'X-RateLimit-Reset': '1',
    })

    const rejected = limiter.check({ tenantId: 'tenant-a', nowMs: 0 })
    expect(toRateLimitHeaders(rejected)['Retry-After']).toBe('1')
  })
})
