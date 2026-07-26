# Multi-Region Replication and Disaster Recovery

## Goals

- Keep critical user flows below **100ms P99** whenever traffic remains in a healthy home region.
- Maintain **99.99% availability** through active-primary plus warm-secondary regional topology.
- Bound data loss with a **500ms replication-lag RPO guardrail** for frontend state, queued submissions, and operational telemetry.
- Require a security review for all traffic-shift, key-rotation, and incident-audit changes.

## Architecture

1. **Active primary region** serves normal frontend traffic and emits replication telemetry.
2. **Warm secondary regions** continuously receive asynchronous replicated state and are eligible for promotion only when heartbeat, P99 latency, and replication-lag checks pass.
3. **Observer regions** participate in monitoring and synthetic read checks but are not promoted automatically.
4. The frontend DR service evaluates region health, creates a failover decision, and exposes the same policy values to dashboards and tests.

## Monitoring and alerting

Alert when any of the following remains true for two consecutive checks:

- Primary heartbeat is older than 30 seconds.
- Critical-path P99 latency is above 100ms.
- Replication lag is above 500ms.
- Canary error rate exceeds 0.1% during a blue-green traffic shift.
- Availability sample drops below 99.99%.

Dashboards should include region role, health, P99 latency, replication lag, heartbeat age, canary status, and the current failover decision.

## Blue-green and canary deployment

1. Deploy the new build to the green environment in every secondary region.
2. Run synthetic read-after-write checks against replicated state.
3. Shift 10% of traffic to green and compare error rate and P99 latency against the policy budget.
4. Ramp to 50%, then 100%, only if canary analysis passes.
5. Keep the previous blue deployment available until the post-deploy DR drill passes.

## Disaster recovery drill

Run a scheduled drill at least monthly and after changes to routing, storage, authentication, or bridge transaction flows. Record:

- RPO: maximum observed replication lag.
- RTO: elapsed time from simulated primary failure to serving traffic in the promoted region.
- Canary outcome and error budget.
- Smoke-test evidence for wallet session, bridge transaction, validator dashboard, and network pages.
- Security-review sign-off for audit logs and access-control changes.
