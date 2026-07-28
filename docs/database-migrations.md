# Database Migration Versioning and Rollback Architecture

## Goals

- Apply database changes in a strict, contiguous version order across VeriNode services.
- Support one-command rollback to a known good version when canary analysis or health checks fail.
- Keep critical-path migration bookkeeping below the 100 ms P99 target by recording compact metadata only.
- Expose migration duration, failure, and rollback metrics for dashboards and alerts.

## Core Design

`DatabaseMigrationManager` owns migration orchestration. Each migration declares a numeric `version`, a human-readable `name`, a `description`, and reversible `up` and `down` handlers. Versions must start at `1` and remain contiguous, which prevents accidentally skipping a change during deploys.

Migration state is abstracted behind `MigrationStateStore`, allowing services to persist applied versions in IndexedDB, an API-backed metadata table, or an in-memory test store. Applied records include the version, checksum, duration, direction, status, and timestamp so operators can audit what ran during a release.

## Rollback Flow

1. Select the last known healthy target version.
2. Generate a rollback plan with `createPlan(targetVersion)`.
3. Execute `migrate(context, targetVersion)`.
4. The manager runs `down` handlers in reverse version order and removes successfully rolled-back records.
5. If a rollback step fails, the manager emits a failure metric and stops so operators can inspect the partially rolled-back state.

## Monitoring and Alerting

The manager emits the following metrics when an `emitMetric` callback is provided:

- `database_migration_duration_ms` tagged by version, name, and direction.
- `database_migration_failure_total` tagged by version, name, and direction.
- `database_migration_rollback_total` tagged by version, name, and direction.

Recommended alerts:

- Page when any `database_migration_failure_total` is greater than zero during a deployment window.
- Warn when migration duration P99 exceeds 100 ms for critical-path migrations.
- Page when rollback count is greater than zero and canary error rate remains above baseline for 10 minutes.

## Blue-Green and Canary Deployment

1. Deploy migrations to the green environment with writes paused or dual-written where applicable.
2. Run `createPlan()` and review pending versions before promotion.
3. Execute `migrate()` against green and verify health checks, backup integrity, and dashboard metrics.
4. Shift 5% of traffic to green and watch canary latency, errors, and migration metrics for at least 15 minutes.
5. Increase to 50%, then 100% if metrics remain healthy.
6. Roll back to the previous version immediately if migration failures, checksum mismatches, or sustained SLO regressions appear.

## Security Review Checklist

- Confirm every migration is reversible or has an approved exception.
- Confirm checksums are generated from reviewed migration metadata.
- Confirm no migration logs secrets, credentials, payload contents, or user private data.
- Confirm rollback instructions have been tested in a non-production environment.
