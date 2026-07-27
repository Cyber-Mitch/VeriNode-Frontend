# Configuration Management

VeriNode uses a typed configuration manager for system-wide settings that need runtime validation and hot-reload. The manager loads a partial configuration from a source, merges schema defaults, validates every key, and atomically publishes only valid snapshots to subscribers.

## Architecture

1. **Config source**: implements `load()` and optional `revision()` for API, localStorage, feature-flag, or file-backed configuration.
2. **Schema**: declares defaults, validators, and whether validation failures are critical.
3. **Manager**: keeps the last known-good snapshot, exposes immutable reads, emits change events, and polls for hot-reload.
4. **Metrics**: exposes reload attempts, successes, failures, validation failures, duration, timestamp, and revision for dashboards and alerts.

Invalid critical updates are rejected and the previous snapshot remains active. Non-critical fields can fall back to defaults while still reporting validation errors.

## Operating targets

- Keep schema validation synchronous and lightweight so reloads do not affect critical paths; callers read in-memory snapshots.
- Alert when `reloadFailures` or `validationFailures` increases in production.
- Use canary release by wiring a canary config source or revision before enabling the same source globally.
