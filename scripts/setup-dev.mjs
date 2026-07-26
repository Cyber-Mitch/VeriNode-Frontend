#!/usr/bin/env node
import { existsSync, copyFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REQUIRED_NODE_MAJOR = 18;
const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');
const skipInstall = args.has('--skip-install');
const skipEnv = args.has('--skip-env');

function log(message = '') {
  console.log(message);
}

function run(command, commandArgs, options = {}) {
  const display = [command, ...commandArgs].join(' ');
  if (dryRun) {
    log(`DRY RUN: ${display}`);
    return;
  }

  const result = spawnSync(command, commandArgs, {
    cwd: rootDir,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    ...options,
  });

  if (result.status !== 0) {
    throw new Error(`Command failed: ${display}`);
  }
}

function assertNodeVersion() {
  const major = Number.parseInt(process.versions.node.split('.')[0] ?? '0', 10);
  if (Number.isNaN(major) || major < REQUIRED_NODE_MAJOR) {
    throw new Error(`Node.js ${REQUIRED_NODE_MAJOR}+ is required. Current version: ${process.version}`);
  }
  log(`✓ Node.js ${process.version} meets the v${REQUIRED_NODE_MAJOR}+ requirement`);
}

function ensureLocalEnv() {
  if (skipEnv) {
    log('• Skipping .env.local creation');
    return;
  }

  const examplePath = resolve(rootDir, '.env.example');
  const localPath = resolve(rootDir, '.env.local');

  if (existsSync(localPath)) {
    log('✓ .env.local already exists');
    return;
  }

  if (!existsSync(examplePath)) {
    log('• No .env.example found; skipping .env.local creation');
    return;
  }

  if (dryRun) {
    log('DRY RUN: copy .env.example to .env.local');
    return;
  }

  copyFileSync(examplePath, localPath);
  log('✓ Created .env.local from .env.example');
}

function installDependencies() {
  if (skipInstall) {
    log('• Skipping dependency installation');
    return;
  }

  const installCommand = existsSync(resolve(rootDir, 'package-lock.json')) ? ['npm', ['ci']] : ['npm', ['install']];
  run(installCommand[0], installCommand[1]);
}

function verifyProject() {
  run('npm', ['run', 'lint']);
}

function printNextSteps() {
  log('\nLocal development setup complete.');
  log('Next steps:');
  log('  1. Review .env.local and replace demo values if needed.');
  log('  2. Start the app with: npm run dev');
  log('  3. Run wallet E2E checks with: npm run test:e2e:wallet');
}

try {
  log('Setting up VeriNode Frontend for local development...\n');
  assertNodeVersion();
  ensureLocalEnv();
  installDependencies();
  verifyProject();
  printNextSteps();
} catch (error) {
  console.error(`\nSetup failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
