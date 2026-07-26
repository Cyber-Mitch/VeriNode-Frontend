#!/usr/bin/env node
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const RUNNERS = {
  lint: ['npm', ['run', 'lint']],
  unit: ['npm', ['run', 'test:precommit']],
};

const SOURCE_EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs']);
const TEST_EXTENSIONS = new Set(['.test.ts', '.test.tsx', '.spec.ts', '.spec.tsx']);

export function parseStagedFiles(output) {
  return output
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((file) => !file.startsWith('node_modules/') && !file.startsWith('.next/'));
}

export function planChecks(files) {
  const hasPackageChange = files.some((file) => ['package.json', 'package-lock.json', 'tsconfig.json', 'eslint.config.mjs'].includes(file));
  const hasSource = files.some((file) => SOURCE_EXTENSIONS.has(path.extname(file)));
  const hasTests = files.some((file) => [...TEST_EXTENSIONS].some((suffix) => file.endsWith(suffix)));

  if (files.length === 0) {
    return [];
  }

  const checks = [];
  if (hasSource || hasPackageChange) {
    checks.push('lint');
  }
  if (hasTests || hasPackageChange) {
    checks.push('unit');
  }
  return checks;
}

function stagedFiles() {
  return parseStagedFiles(
    execFileSync('git', ['diff', '--cached', '--name-only', '--diff-filter=ACMR'], {
      cwd: ROOT,
      encoding: 'utf8',
    }),
  );
}

function runCheck(name) {
  const [command, args] = RUNNERS[name];
  console.log(`\n▶ ${name}: ${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, { cwd: ROOT, stdio: 'inherit', shell: process.platform === 'win32' });
  return result.status ?? 1;
}

export function runPreCommit(files = stagedFiles()) {
  if (process.env.SKIP_PRECOMMIT === '1') {
    console.log('Skipping pre-commit checks because SKIP_PRECOMMIT=1.');
    return 0;
  }

  if (!existsSync(path.join(ROOT, 'package.json'))) {
    console.error('pre-commit checks must run from the repository root.');
    return 1;
  }

  const checks = planChecks(files);
  if (checks.length === 0) {
    console.log('No staged frontend files require pre-commit checks.');
    return 0;
  }

  console.log(`Running pre-commit checks for ${files.length} staged file(s): ${checks.join(', ')}`);
  for (const check of checks) {
    const status = runCheck(check);
    if (status !== 0) {
      console.error(`\n✖ ${check} failed. Fix the issue or set SKIP_PRECOMMIT=1 only for emergencies.`);
      return status;
    }
  }
  console.log('\n✓ Pre-commit checks passed.');
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit(runPreCommit());
}
