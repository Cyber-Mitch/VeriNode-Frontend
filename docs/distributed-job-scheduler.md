# Distributed Job Scheduler with Lease-based Worker Claiming

This document describes the implementation for issue #116. The scheduler is built around durable jobs, short leases, idempotent completion, and metrics that let operators protect the `<100ms` P99 claim path and `99.99%` availability target.

## Architecture

1. Producers enqueue jobs with a queue name, priority, `runAt`, and `maxAttempts`.
2. Workers claim jobs by queue using a compare-and-swap style lease update. A claimed job receives `leaseOwnerId`, `leaseToken`, and `leaseExpiresAt`.
3. Workers complete or fail jobs only when both `leaseOwnerId` and `leaseToken` still match, preventing stale workers from acknowledging work after lease expiry.
4. Expired leases are reclaimed back to `queued` unless the job has exhausted attempts, in which case it is moved to `dead-lettered`.
5. Blue-green and canary deployment should route a small worker cohort to the new claim loop first, compare P99 claim latency and dead-letter rate, then shift the remaining workers.

## Critical-path performance

The pure claim algorithm normalizes expired leases, filters claimable jobs, orders by priority and FIFO tie-breakers, and leases at most `maxJobs`. Production storage should back this with indexes on `(queue, status, runAt, priority, createdAt)` and an atomic conditional update on `id` plus current lease fields.

## Monitoring and alerting

Track these signals per queue and worker pool:

- `scheduler_claim_latency_ms` histogram with a critical alert when P99 is `>=100ms`.
- `scheduler_expired_leases_total` warning when leases are waiting for reclaim.
- `scheduler_dead_letter_total` warning when jobs exhaust retries.
- `scheduler_claim_conflicts_total` for database contention and split-brain detection.
- Worker heartbeat freshness and per-queue backlog age.

## Security review checklist

- Lease tokens are unguessable in production and are never logged with job payload secrets.
- Job payloads are schema-validated before enqueue and before execution.
- Workers authorize queue access through service identity, not user-supplied queue names.
- Dead-letter payloads follow the same retention and redaction policy as audit logs.

## Runbook

1. If P99 claim latency breaches `100ms`, inspect database lock wait time, queue indexes, and worker concurrency.
2. If expired leases grow, verify worker heartbeats and downstream RPC availability, then temporarily reduce lease duration only after confirming idempotency.
3. If dead letters spike, pause producers for the affected queue, sample errors, replay safe jobs after fixing the root cause, and keep the canary below 10% until metrics recover.
