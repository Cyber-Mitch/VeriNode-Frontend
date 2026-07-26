# Code Coverage Threshold Enforcement

## Architecture

Unit coverage is enforced by Vitest in the frontend CI pipeline. The `test:coverage`
script runs the same unit test suite as `test:unit`, enables the V8 coverage
provider, and applies the global threshold gates defined in `vitest.config.mts`.

Coverage enforcement is intentionally part of the build job and runs after linting
but before the production build. This order fails pull requests early when tested
code drops below the agreed quality bar while keeping the existing build and
performance jobs unchanged.

## Threshold Policy

The current global thresholds are:

- Statements: 70%
- Branches: 60%
- Functions: 70%
- Lines: 70%

Coverage collection includes application TypeScript and TSX files under `src/` and
excludes test files, colocated test directories, and declaration files. The CI job
publishes the generated `coverage/` directory as a GitHub Actions artifact so the
HTML/LCOV reports can be inspected after every run.

## Monitoring and Alerting

GitHub Actions is the source of truth for this gate:

1. The `Frontend Build Check` workflow fails when coverage is below threshold.
2. Branch protection should require the workflow before merge.
3. The uploaded `coverage-report` artifact provides line-level diagnostics for
   reviewers and maintainers.

For operational alerting, configure repository or organization notifications for
failed required checks. No runtime dashboard is required because this control is a
CI quality gate and does not affect production request paths.

## Deployment and Rollout

This change is safe to roll out through the normal pull-request workflow because
it only modifies CI behavior and test configuration. If coverage enforcement needs
to be relaxed during rollout, adjust the thresholds in `vitest.config.mts` in a
follow-up pull request after review.

## Runbook

When the coverage gate fails:

1. Download the `coverage-report` artifact from the failed workflow run.
2. Open `coverage/lcov-report/index.html` locally to identify uncovered files.
3. Add or improve tests for the changed behavior.
4. Run `npm run test:coverage` locally before pushing the fix.
5. If a threshold adjustment is required, document the reason in the pull request
   and keep the change scoped to `vitest.config.mts`.
