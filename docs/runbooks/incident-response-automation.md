# Incident Response Runbook Automation

This runbook documents the frontend-side incident automation contract for PagerDuty-triggered remediation across VeriNode services.

## Architecture

1. PagerDuty Events v2 sends incident webhooks into the platform gateway.
2. The gateway normalizes the webhook into `PagerDutyIncidentPayload`.
3. `selectRunbook` maps service IDs and severity to an approved `RunbookDefinition`.
4. `buildRunbookExecutionPlan` produces deterministic responder actions, dashboard links, rollback steps, and escalation policy metadata.
5. Canary analysis uses the latest telemetry sample to decide whether a blue-green rollout should be promoted, held, or rolled back.

## Operational Targets

- Critical-path P99 latency must stay below 100 ms.
- Availability must stay at or above 99.99%.
- Canary error rate must remain below 1% before promotion.
- Every production automation plan includes a PagerDuty escalation policy and owner team.

## Security Review Checklist

- Validate PagerDuty signatures at the gateway before calling the normalization helper.
- Do not store webhook secrets in browser-accessible code.
- Restrict automated rollback and mode-switch actions to server-side operators with audited credentials.
- Review new runbook definitions for least-privilege dashboard and responder access.

## Deployment Strategy

Use blue-green deploys for automation changes. Route a small canary of incident simulations to the new version, run `analyzeCanary`, and only promote when it returns `promote`. A `hold` result requires responder review; a `rollback` result routes traffic back to the previous green pool.
