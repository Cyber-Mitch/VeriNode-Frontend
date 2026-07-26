# SLO monitoring and burn-rate alerting

## Architecture

VeriNode evaluates service-level indicators for critical user journeys in a lightweight frontend service so operators can see error-budget risk even when backend telemetry is partially degraded.

- **Objectives:** 99.99% platform availability and P99 critical-path latency below 100ms.
- **Inputs:** rolling request success counters, latency P99 samples, service identifier, and capture time.
- **Core logic:** `evaluateSloWindow` normalizes availability, compares latency objectives, computes error-budget burn rate, and derives alert severity.
- **Dashboard:** the network status page renders a burn-rate panel with current paging/ticket counts and per-window diagnostics.

## Alert policy

- **Critical/page:** burn rate at or above 14.4x.
- **Warning/ticket:** burn rate at or above 6x.
- **Healthy:** burn rate below ticket threshold.

## Deployment strategy

1. Ship instrumentation behind the existing dashboard route.
2. Run a blue-green release by serving the new dashboard to the green environment first.
3. Canary 5% of operators for 30 minutes and compare client errors, render latency, and alert volume.
4. Promote to 100% only if P99 dashboard render path remains below 100ms and no false critical alert burst occurs.
5. Roll back by disabling the SLO dashboard import on the network page if canary analysis fails.

## Security review checklist

- Do not include user identifiers in SLO samples.
- Sanitize service names before wiring live backend data to UI rendering.
- Confirm alert webhooks use least-privilege credentials and rotated secrets.
- Verify runbook links do not expose internal incident channels to unauthenticated users.

## Operator response

1. Acknowledge the highest-severity burn-rate alert.
2. Check the affected objective, window, burn rate, and time-to-exhaustion.
3. Correlate with deployment, dependency, and Kafka lag dashboards.
4. For critical alerts, start incident response and freeze non-emergency deploys.
5. After mitigation, confirm burn rate returns below 6x on short and long windows.
