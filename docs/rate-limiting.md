# API Rate Limiting with Per-Tenant Token Buckets

## Architecture

VeriNode API ingress should run a token bucket for each `tenantId + scope` pair. The shared implementation lives in `src/services/rateLimiter.ts` and is intentionally dependency-free so it can be reused by Next.js route handlers, edge middleware, server-side service adapters, and tests.

Each bucket has:

- `capacity`: the maximum burst size a tenant can spend immediately.
- `refillRatePerSecond`: the sustained request budget.
- `tokens`: the current balance, refilled lazily on each check.
- `updatedAtMs`: the last timestamp used for refill calculations.

Tenant-specific policies override the default policy. Scopes split traffic classes such as `global`, `read`, `write`, `webhook`, or `admin` so expensive paths can carry a higher token `cost` without starving cheaper reads.

## Critical Path Performance

The in-process decision path is O(1): derive a map key, refill one bucket, compare token cost, and update counters. This keeps the local portion of API admission well below the 100 ms P99 target. Production deployments that need multi-instance consistency should back the same algorithm with an atomic Redis/Lua or edge-KV primitive and preserve the same result contract.

## Monitoring and Alerts

Export `getMetricsSnapshot()` on an interval to the metrics pipeline:

- `rate_limit_allowed_total{tenant}`
- `rate_limit_limited_total{tenant}`
- `rate_limit_active_buckets`
- `rate_limit_rejection_ratio{tenant}` = limited / (allowed + limited)

Recommended alerts:

1. Page when global rejection ratio is above 20% for 10 minutes.
2. Page when a paid tenant rejection ratio is above its SLO for 5 minutes.
3. Warn when active buckets grow 2x above the 7-day baseline, which may indicate tenant-ID abuse.
4. Warn when limiter backing storage latency threatens the 100 ms P99 critical-path target.

## Deployment Plan

1. Ship in shadow mode: compute decisions and metrics, but do not reject requests.
2. Enable enforcement for internal tenants and low-risk read scopes.
3. Canary 5% of production tenants and compare latency, 429 rate, and support tickets.
4. Expand with blue-green deployment after canary health is stable for one full traffic cycle.
5. Keep a feature flag that falls back to shadow mode during incident response.

## Security Notes

- Never trust tenant IDs supplied only by arbitrary request headers; derive them from authenticated session, API key, or mTLS identity.
- Avoid logging raw credentials or PII in rate-limit events.
- Return standard `X-RateLimit-*` and `Retry-After` headers without revealing other tenant policies.
- Use per-route `cost` values for expensive endpoints to reduce denial-of-wallet risk.

## Runbook

### High 429 Rate

1. Check `rate_limit_rejection_ratio{tenant}` and determine whether the spike is isolated or global.
2. Confirm recent deploys did not lower `capacity` or `refillRatePerSecond` unexpectedly.
3. If legitimate traffic is blocked, temporarily raise the tenant policy or switch enforcement to shadow mode.
4. If abusive traffic is confirmed, keep enforcement on and coordinate with security for API-key rotation or tenant suspension.

### Limiter Storage Latency

1. Compare API P99 latency with limiter storage latency.
2. Fail open to shadow mode if availability is at risk.
3. Scale or fail over backing storage before re-enabling hard enforcement.
