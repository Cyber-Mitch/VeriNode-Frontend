# Runtime Configuration Auditing and Drift Detection

## Architecture

Runtime services compare their approved baseline configuration with the observed process/runtime configuration using `auditRuntimeConfig`. The audit layer produces a deterministic, redacted fingerprint for the baseline and runtime configuration, emits tamper-resistant audit events, and classifies drift findings by operational risk.

```text
approved baseline ─┐
                   ├─ auditRuntimeConfig ── audit events ── log pipeline
runtime snapshot ──┘                         metrics ─────── dashboard
                                             alerts ──────── pager/escalation
```

## Drift policy

- Critical drift: endpoint, RPC, URL, contract, network, chain ID, and feature flag changes.
- Warning drift: changed or removed non-critical values.
- Info drift: newly added non-critical values.
- Sensitive values are redacted before fingerprinting, audit event construction, and alert generation.

## Monitoring and alerting

Dashboards should track `totalFindings`, `criticalFindings`, `warningFindings`, `infoFindings`, `baselineFingerprint`, and `runtimeFingerprint` per service/environment. Alert routing should page on critical findings, create tickets for warnings, and retain info findings for compliance review.

## Deployment and canary analysis

Blue-green deployments should run `analyzeCanary` against the candidate environment before promotion. The default promotion gate requires zero critical findings, no more than two warning findings, and at least 99.99% observed health. Any critical drift or availability breach returns a rollback decision; warning-only drift returns hold for manual review.

## Runbook

1. Open the runtime configuration dashboard for the impacted service/environment.
2. Compare the runtime fingerprint against the last approved baseline fingerprint.
3. Inspect alert labels to identify the drifted path.
4. If critical drift is expected, obtain security approval and update the baseline in the release artifact.
5. If critical drift is unexpected, roll back the canary/green environment and rotate any affected secrets.
6. Export audit events for security review and attach them to the incident record.
