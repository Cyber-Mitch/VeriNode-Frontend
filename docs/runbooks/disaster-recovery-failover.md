# Disaster Recovery Failover Runbook

## Preconditions

- Incident commander confirms primary region is unavailable or failing hard health checks.
- Security reviewer is assigned before changing routing or promotion permissions.
- Latest replication dashboard shows at least one secondary region inside the 500ms RPO guardrail.

## Procedure

1. Freeze writes on the unhealthy primary and snapshot pending queues.
2. Promote the healthiest secondary region selected by the failover decision engine.
3. Rotate global load-balancer traffic to the promoted region.
4. Run smoke tests for wallet sessions, bridge transactions, validator dashboards, and network pages.
5. Start a 10% canary and validate error rate below 0.1% with P99 latency below 100ms for critical paths.
6. Ramp traffic to 50%, then 100%, if canary analysis remains green.
7. Attach replication telemetry, smoke-test output, and audit logs to the incident record.

## Rollback

- If canary analysis fails, pin traffic to the last stable region.
- If every secondary exceeds the RPO guardrail, stop automatic promotion and keep the incident in manual review.
- Restore writes only after security review confirms routing and access controls are correct.
