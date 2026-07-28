/**
 * API Rate Limiting with Per-Tenant Token Buckets (#113)
 *
 * A lightweight, dependency-free implementation intended for edge/API
 * middleware and service adapters. It keeps one token bucket per tenant and
 * route class, exposes deterministic clocks for tests, and emits compact
 * metrics snapshots for dashboards and alerting pipelines.
 */

export type RateLimitDecision = 'allowed' | 'limited'

export interface TokenBucketConfig {
  /** Maximum burst capacity for this bucket. */
  capacity: number
  /** Tokens refilled per second. */
  refillRatePerSecond: number
}

export interface TenantRateLimitPolicy extends TokenBucketConfig {
  /** Tenant identifier used in logs/metrics. */
  tenantId: string
}

export interface RateLimitRequest {
  tenantId: string
  /** Optional route or service key. Defaults to `global`. */
  scope?: string
  /** Token cost for this operation. Defaults to 1. */
  cost?: number
  /** Unix millisecond timestamp. Defaults to `Date.now()`. */
  nowMs?: number
}

export interface RateLimitResult {
  decision: RateLimitDecision
  allowed: boolean
  tenantId: string
  scope: string
  limit: number
  remaining: number
  retryAfterMs: number
  resetAtMs: number
}

export interface RateLimitMetricsSnapshot {
  allowed: number
  limited: number
  buckets: number
  perTenant: Record<string, { allowed: number; limited: number }>
}

interface BucketState {
  tokens: number
  updatedAtMs: number
}

export interface RateLimiterOptions {
  defaultPolicy: TokenBucketConfig
  tenantPolicies?: TenantRateLimitPolicy[]
  now?: () => number
}

const DEFAULT_SCOPE = 'global'
const MS_PER_SECOND = 1_000

function validatePolicy(policy: TokenBucketConfig): void {
  if (!Number.isFinite(policy.capacity) || policy.capacity <= 0) {
    throw new Error('Token bucket capacity must be a positive number')
  }
  if (!Number.isFinite(policy.refillRatePerSecond) || policy.refillRatePerSecond <= 0) {
    throw new Error('Token bucket refill rate must be a positive number')
  }
}

function bucketKey(tenantId: string, scope: string): string {
  return `${tenantId}:${scope}`
}

function roundDownTokens(value: number): number {
  return Math.max(0, Math.floor(value))
}

/** Pure token-bucket primitive exported for focused tests. */
export function consumeFromTokenBucket(
  state: BucketState,
  config: TokenBucketConfig,
  cost: number,
  nowMs: number,
): { state: BucketState; allowed: boolean; retryAfterMs: number; resetAtMs: number } {
  validatePolicy(config)
  if (!Number.isFinite(cost) || cost <= 0) throw new Error('Token cost must be a positive number')

  const elapsedMs = Math.max(0, nowMs - state.updatedAtMs)
  const refilledTokens = (elapsedMs / MS_PER_SECOND) * config.refillRatePerSecond
  const tokens = Math.min(config.capacity, state.tokens + refilledTokens)
  const allowed = tokens >= cost
  const nextTokens = allowed ? tokens - cost : tokens
  const missingTokens = Math.max(0, cost - tokens)
  const retryAfterMs = allowed ? 0 : Math.ceil((missingTokens / config.refillRatePerSecond) * MS_PER_SECOND)
  const resetAtMs = nowMs + Math.ceil(((config.capacity - nextTokens) / config.refillRatePerSecond) * MS_PER_SECOND)

  return {
    state: { tokens: nextTokens, updatedAtMs: nowMs },
    allowed,
    retryAfterMs,
    resetAtMs,
  }
}

export class PerTenantRateLimiter {
  private readonly defaultPolicy: TokenBucketConfig
  private readonly tenantPolicies = new Map<string, TokenBucketConfig>()
  private readonly buckets = new Map<string, BucketState>()
  private readonly now: () => number
  private readonly metrics: RateLimitMetricsSnapshot = { allowed: 0, limited: 0, buckets: 0, perTenant: {} }

  constructor(options: RateLimiterOptions) {
    validatePolicy(options.defaultPolicy)
    this.defaultPolicy = options.defaultPolicy
    this.now = options.now ?? Date.now
    for (const policy of options.tenantPolicies ?? []) {
      validatePolicy(policy)
      this.tenantPolicies.set(policy.tenantId, {
        capacity: policy.capacity,
        refillRatePerSecond: policy.refillRatePerSecond,
      })
    }
  }

  check(request: RateLimitRequest): RateLimitResult {
    const tenantId = request.tenantId.trim()
    if (!tenantId) throw new Error('tenantId is required for rate limiting')

    const scope = request.scope?.trim() || DEFAULT_SCOPE
    const cost = request.cost ?? 1
    const nowMs = request.nowMs ?? this.now()
    const policy = this.tenantPolicies.get(tenantId) ?? this.defaultPolicy
    const key = bucketKey(tenantId, scope)
    const state = this.buckets.get(key) ?? { tokens: policy.capacity, updatedAtMs: nowMs }
    const outcome = consumeFromTokenBucket(state, policy, cost, nowMs)

    this.buckets.set(key, outcome.state)
    this.recordMetric(tenantId, outcome.allowed)

    return {
      decision: outcome.allowed ? 'allowed' : 'limited',
      allowed: outcome.allowed,
      tenantId,
      scope,
      limit: policy.capacity,
      remaining: roundDownTokens(outcome.state.tokens),
      retryAfterMs: outcome.retryAfterMs,
      resetAtMs: outcome.resetAtMs,
    }
  }

  getMetricsSnapshot(): RateLimitMetricsSnapshot {
    return {
      allowed: this.metrics.allowed,
      limited: this.metrics.limited,
      buckets: this.buckets.size,
      perTenant: Object.fromEntries(
        Object.entries(this.metrics.perTenant).map(([tenantId, counts]) => [tenantId, { ...counts }]),
      ),
    }
  }

  reset(): void {
    this.buckets.clear()
    this.metrics.allowed = 0
    this.metrics.limited = 0
    this.metrics.buckets = 0
    this.metrics.perTenant = {}
  }

  private recordMetric(tenantId: string, allowed: boolean): void {
    if (!this.metrics.perTenant[tenantId]) this.metrics.perTenant[tenantId] = { allowed: 0, limited: 0 }
    if (allowed) {
      this.metrics.allowed += 1
      this.metrics.perTenant[tenantId].allowed += 1
    } else {
      this.metrics.limited += 1
      this.metrics.perTenant[tenantId].limited += 1
    }
    this.metrics.buckets = this.buckets.size
  }
}

export function createPerTenantRateLimiter(options: RateLimiterOptions): PerTenantRateLimiter {
  return new PerTenantRateLimiter(options)
}

export function toRateLimitHeaders(result: RateLimitResult): Record<string, string> {
  return {
    'X-RateLimit-Limit': String(result.limit),
    'X-RateLimit-Remaining': String(result.remaining),
    'X-RateLimit-Reset': String(Math.ceil(result.resetAtMs / MS_PER_SECOND)),
    ...(result.allowed ? {} : { 'Retry-After': String(Math.ceil(result.retryAfterMs / MS_PER_SECOND)) }),
  }
}
