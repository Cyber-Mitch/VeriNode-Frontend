# Configuration Hot-Reload Runbook

## Deploying a config change

1. Validate the change against the service schema in staging.
2. Publish to the canary config source and watch reload metrics for at least one poll interval.
3. Promote with blue-green deployment by switching the active source revision for the green environment.
4. Roll back by restoring the previous revision; services keep the last known-good snapshot if validation fails.

## Alerts

Page the service owner when any of these occur:

- `validationFailures` increases for a production service.
- `reloadFailures` increases for three consecutive poll intervals.
- `lastSuccessfulReloadAt` is older than two expected poll intervals.
