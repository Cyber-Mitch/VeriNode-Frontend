# Structured Logging with OpenTelemetry Semantic Conventions

VeriNode emits application logs as single-line JSON records shaped after the OpenTelemetry log data model. The shared logger lives in `src/services/logging` and is safe to use in browser, Node.js, and Edge runtime code paths.

## Architecture

- Use `logger.info`, `logger.warn`, `logger.error`, etc. instead of ad-hoc `console.*` calls in application code.
- Every record includes OpenTelemetry-aligned fields: `timestamp`, `observedTimestamp`, `severityText`, `severityNumber`, `body`, `resource`, and `attributes`.
- Resource attributes include `service.name`, `service.version`, `deployment.environment.name`, `telemetry.sdk.name`, and `telemetry.sdk.language`.
- When a trace span is active, the logger attaches `traceId`, `spanId`, and `trace.flags` so logs can be correlated with distributed traces.
- Attributes should use OpenTelemetry semantic convention keys where applicable, such as `event.name`, `error.type`, `http.request.method`, `server.address`, `url.full`, or `user.id`.

## Configuration

The logger uses these environment variables when constructing resource attributes:

| Variable | Purpose | Default |
| --- | --- | --- |
| `NEXT_PUBLIC_OTEL_SERVICE_NAME` | Service identity in logs and traces | `verinode-frontend` |
| `NEXT_PUBLIC_APP_VERSION` | Deployed application version | `npm_package_version` or `0.1.0` |
| `NEXT_PUBLIC_VERCEL_ENV` | Deployment environment name | `NODE_ENV` or `development` |

## Operational guidance

- Ship stdout/stderr to the collector or log backend; each emitted line is valid JSON.
- Create alerts on `severityText` values of `ERROR` and `FATAL`, grouped by `resource.service.name` and `attributes.event.name`.
- Build dashboards for log volume, error rate, and top error types using `severityNumber`, `event.name`, and `error.type`.
- During canary or blue-green rollout, compare `ERROR`/`FATAL` rates and P99 latency traces between the baseline and candidate versions before increasing traffic.
- Runbooks should include the trace correlation workflow: search the log backend by `traceId`, then pivot into the tracing backend for the same trace.
