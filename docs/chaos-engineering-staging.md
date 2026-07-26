# Blueprint for Chaos Engineering Testing in Staging

This blueprint defines how VeriNode runs controlled failure experiments in staging while preserving the critical-path latency target of **< 100 ms P99**, the availability target of **99.99%**, and the requirement that every experiment pass security review before execution.

## Architecture

1. **Experiment registry** — `src/config/chaosEngineering.ts` stores the approved staging experiments, service scope, blast radius, abort conditions, dashboard panels, and runbook anchors.
2. **Orchestrator** — CI or an operator workflow reads the registry, verifies readiness with `evaluateChaosReadiness`, and applies faults through the staging platform tooling.
3. **Safety controller** — automated checks stop an experiment when any abort condition breaches its threshold for the configured duration.
4. **Observability plane** — dashboards must expose latency, availability, error budget burn, synthetic transaction success, and security alerts before the experiment starts.
5. **Deployment gate** — chaos experiments run against the green environment first, then move through canary analysis before staging traffic is fully shifted.

## Guardrails

- Limit each experiment to a maximum 10% blast radius and 30-minute duration.
- Require SRE ownership and Security approval for every staging experiment.
- Abort when critical path P99 latency exceeds 100 ms for 3 minutes.
- Abort when synthetic availability drops below 99.99% for 2 minutes.
- Abort when error-budget burn reaches 2x for 5 minutes.
- Abort immediately on any security alert.

## Approved staging experiments

### Stellar RPC latency injection

- **Registry ID:** `chaos-stg-rpc-latency`
- **Services:** web app, Stellar RPC, indexer
- **Fault:** inject latency on Stellar RPC read paths
- **Expected steady state:** cache fallback and bounded retries keep critical reads below 100 ms P99
- **Dashboards:** critical path P99, RPC fallback rate, synthetic transaction success, error budget burn

### Wallet adapter failover

- **Registry ID:** `chaos-stg-wallet-adapter-failover`
- **Services:** web app, wallet adapter
- **Fault:** disable the primary wallet adapter endpoint
- **Expected steady state:** connection UX degrades gracefully and recovery banners render without blocking dashboards
- **Dashboards:** wallet connect success, wallet error rate, frontend web vitals, support contact rate

### Notification worker resource pressure

- **Registry ID:** `chaos-stg-worker-resource-pressure`
- **Services:** notification worker, observability
- **Fault:** apply CPU and memory pressure to notification workers
- **Expected steady state:** queues drain after autoscaling and alert delivery latency remains inside staging SLOs
- **Dashboards:** worker CPU saturation, queue depth, alert delivery latency, autoscaler decisions

## Execution runbook

1. Confirm the target experiment is present in `stagingChaosExperiments` and `evaluateChaosReadiness` returns `ready: true`.
2. Confirm the active staging deployment is the green environment and the previous blue environment is healthy for rollback.
3. Announce the experiment window, expected blast radius, and rollback owner in the staging incident channel.
4. Start synthetic canary transactions and verify baseline P99 latency, availability, error-budget burn, and security-alert metrics.
5. Apply the fault at the configured blast radius.
6. Watch abort conditions continuously; stop the experiment and roll back traffic on any breach.
7. If steady state holds for the configured duration, remove the fault and continue observing recovery for 15 minutes.
8. Record findings, metric links, screenshots, and follow-up work in the experiment report.

## Monitoring and alerting checklist

- Critical-path latency panel with P50, P95, and P99 overlays.
- Synthetic availability panel with the 99.99% threshold annotated.
- Error-budget burn alert at 2x over 5 minutes.
- Security alert stream filtered to staging services in scope.
- Service-specific saturation panels for CPU, memory, queue depth, fallback rate, and wallet connection errors.
- Canary comparison between blue and green deployments before full traffic shift.

## Security review checklist

- Fault tooling can target staging only and cannot mutate production resources.
- Experiment credentials are short-lived and scoped to approved services.
- Audit logs capture the operator, experiment ID, start time, abort reason, and rollback outcome.
- Customer-like test data remains synthetic and contains no production secrets.
- Security signs off before the experiment is added to the approved registry.
