# Runbook: Database Migration Rollback

## When to Use

Use this runbook when a database migration causes failed canary analysis, elevated API errors, checksum mismatches, or a sustained critical-path latency regression.

## Preconditions

- Identify the currently applied version from the migration records dashboard.
- Identify the last known healthy target version.
- Confirm a recent verified backup exists before rollback.
- Notify the incident channel and deployment owner.

## Procedure

1. Stop further traffic promotion in the blue-green deployment tool.
2. Generate the rollback plan for the target version and confirm versions are listed in descending order.
3. Execute the rollback through the service migration command or administrative console.
4. Watch `database_migration_rollback_total`, `database_migration_failure_total`, and `database_migration_duration_ms`.
5. Run database health verification and application smoke tests.
6. Shift traffic back to the healthy environment if rollback fails or user-facing errors continue.
7. Record the failed version, error, duration, and remediation in the incident ticket.

## Success Criteria

- Current migration version matches the target version.
- No new migration failures are emitted for 10 minutes.
- Critical-path P99 latency is below 100 ms or back to pre-deploy baseline.
- Backup integrity verification passes.
