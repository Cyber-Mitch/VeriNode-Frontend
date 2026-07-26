# Cache layer architecture

VeriNode uses a two-tier cache strategy for critical read paths:

1. **In-memory default store** via `MemoryCacheStore`, which keeps hot values in a bounded least-recently-used map.
2. **Optional Redis-backed store** via `RedisHttpCacheStore`, intended for deployments that expose Redis through a REST gateway such as Upstash or an internal cache service.

The exported `CacheLayer` API centralizes `get`, `set`, `delete`, and `getOrSet` operations with a configurable TTL. By default the application-level singleton reads `NEXT_PUBLIC_CACHE_TTL_MS` and `NEXT_PUBLIC_CACHE_NAMESPACE`, falling back to a five-minute TTL and the `verinode` namespace.

## SLO guardrails

- Critical-path cache operations record latency samples and expose a P99 latency metric through `snapshot()`.
- The in-memory store is bounded to prevent unbounded growth and automatically evicts least-recently-used entries.
- Expired entries are treated as misses and removed on read.
- Cache backend errors are swallowed after incrementing the error metric so the application can fall back to the origin service instead of failing closed.

## Monitoring and alerting

Dashboards should scrape `snapshot()` and alert when:

- `p99LatencyMs` is greater than `100` for critical paths.
- `hitRate` drops below the service-specific target.
- `errors` increases for Redis-backed deployments.
- `evictions` rises unexpectedly, which can indicate undersized memory limits or TTLs that are too short.

## Deployment notes

Use blue-green rollout when switching the backing store to Redis. Start with read-through cache usage on a canary cohort, verify P99 latency, hit rate, and Redis error alerts, then increase traffic. Keep the previous in-memory configuration available for rollback.
