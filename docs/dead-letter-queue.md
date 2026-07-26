# Dead Letter Queue for Failed Message Processing

## Architecture

Failed Kafka messages are retried by the owning consumer group and then routed to a dead-letter queue (DLQ) after a terminal failure. The frontend models this with a redacted `DeadLetterMessage` envelope keyed by `consumerGroupId:topic:partition:offset`, which makes repeated failure reports idempotent and safe to replay after operator review.

The monitoring hook fetches consumer lag, scaling status, and DLQ depth in parallel so dashboards have one refresh path for throughput and failure processing. The DLQ critical path is bounded to synchronous classification, deterministic ID generation, payload redaction, and metric summarization; there is no unbounded payload retention in the browser model.

## Monitoring and alerting

DLQ metrics include total depth, quarantined count, replay-ready count, replayed/discarded counts, oldest message age, and a `critical` flag. The alert threshold is critical when either:

- at least 100 messages remain quarantined, or
- the oldest failed message has been quarantined for at least 15 minutes.

Dashboards should page the owning service when `critical` is true and include the topic, consumer group, partition, offset, reason, trace ID, and redacted payload preview.

## Security

Payload previews redact common sensitive fields such as `password`, `secret`, `token`, `privateKey`, and `authorization`. Production APIs should store encrypted full payloads server-side, expose only redacted previews to the frontend, and require an audited operator action before a message moves to `replay-ready`, `replayed`, or `discarded`.

## Deployment and operations

Deploy DLQ producers and replay workers with blue-green releases. During canary analysis, compare DLQ rate, retry-exhausted rate, handler latency, and replay success rate between old and new consumer pools. Roll back if canary DLQ rate exceeds baseline by more than the agreed service SLO window or if P99 processing latency exceeds 100 ms on critical paths.

## Runbook

1. Open the Kafka monitoring dashboard and inspect DLQ metrics.
2. If `critical` is true, page the owning service and freeze automated replay.
3. Inspect the redacted payload preview and trace ID to identify schema, poison-message, retry exhaustion, or handler errors.
4. Patch the handler or schema mapping, deploy with blue-green, then mark safe messages as `replay-ready`.
5. Replay in small batches during canary analysis and monitor replay success, duplicate side effects, and consumer lag.
6. Mark irrecoverable poison messages as `discarded` only after audit approval.
