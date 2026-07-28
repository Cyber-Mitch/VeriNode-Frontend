# Pre-Commit Hook Suite

## Architecture

The repository uses a checked-in Git hook path (`.githooks`) and a Node.js orchestration script (`scripts/pre-commit-check.mjs`) instead of an additional hook framework dependency. Running `npm install` executes the `prepare` script, which configures `core.hooksPath` to `.githooks` for the local clone.

```text
git commit
  └─ .githooks/pre-commit
      └─ npm run precommit
          └─ scripts/pre-commit-check.mjs
              ├─ git diff --cached --name-only --diff-filter=ACMR
              ├─ npm run lint
              └─ npm run test:precommit (hook/toolchain changes only)
```

## Enforcement Policy

- Documentation-only commits pass without running expensive checks.
- JavaScript and TypeScript source changes run ESLint so security and correctness rules execute before commit.
- Hook test files and package/toolchain changes also run the pre-commit suite's Node.js tests. Type checking remains available through `npm run typecheck` and should be run before opening release-bound pull requests while the repository resolves its existing baseline type errors.
- Generated or dependency directories such as `.next/` and `node_modules/` are ignored.
- Emergency bypass is available with `SKIP_PRECOMMIT=1 git commit ...`; any bypass should be documented in the pull request and remediated immediately.

## Operational Notes

- The hook fails fast on the first failed check to keep developer feedback quick.
- CI remains the authoritative gate for build, performance, and full regression coverage.
- Security-sensitive rules such as the existing ban on `dangerouslySetInnerHTML` are enforced through ESLint during the hook.
- Blue-green deployment and canary analysis are not triggered locally; they remain release-pipeline responsibilities after CI passes.
