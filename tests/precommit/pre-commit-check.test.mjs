import test from 'node:test';
import assert from 'node:assert/strict';
import { parseStagedFiles, planChecks } from '../../scripts/pre-commit-check.mjs';

test('parseStagedFiles removes blank and generated entries', () => {
  assert.deepEqual(parseStagedFiles('\nsrc/app/page.tsx\n.next/cache/file\nnode_modules/pkg/index.js\nREADME.md\n'), [
    'src/app/page.tsx',
    'README.md',
  ]);
});

test('planChecks skips documentation-only changes', () => {
  assert.deepEqual(planChecks(['README.md', 'docs/pre-commit-hooks.md']), []);
});

test('planChecks runs lint for source changes', () => {
  assert.deepEqual(planChecks(['src/services/auditLogService.ts']), ['lint']);
});

test('planChecks includes unit tests for test and toolchain changes', () => {
  assert.deepEqual(planChecks(['src/services/tests/webhookService.test.ts']), ['lint', 'unit']);
  assert.deepEqual(planChecks(['package.json']), ['lint', 'unit']);
});
