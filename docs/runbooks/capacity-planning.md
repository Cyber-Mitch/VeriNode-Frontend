# Capacity Planning Runbook

## Architecture

VeriNode records historical usage samples per service for CPU, memory, storage, request rate, P99 response time, and error rate. The capacity planning service groups samples by service and metric, applies least-squares historical trending, and projects 7-day and 30-day utilization against warning and critical limits.

## Monitoring and alerting

- Warning alerts fire when current usage crosses warning limits or the 30-day projection exceeds a warning limit.
- Critical alerts fire when current usage crosses critical limits or the 7-day projection exceeds a critical limit.
- Alert payloads include service, metric, current value, projections, estimated days to threshold, and this runbook path.
- Dashboards should chart current value, daily trend, 7-day projection, 30-day projection, and status for each service metric.

## Response procedure

1. Confirm the affected service and metric in the capacity dashboard.
2. Compare the latest sample with the 7-day and 30-day projections.
3. If critical capacity is expected within seven days, scale the service or provision storage immediately.
4. Deploy capacity changes with blue-green rollout and canary analysis before promoting to full traffic.
5. Keep critical paths below 100ms P99 and verify availability objectives after rollout.

## Security review

Capacity samples must not include secrets, wallet keys, customer payloads, or personally identifiable data. Only aggregate numeric infrastructure metrics should be stored or exported.
