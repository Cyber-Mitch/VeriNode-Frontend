import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const reportPath = resolve('reports/security/npm-audit.json');
mkdirSync(dirname(reportPath), { recursive: true });

const audit = spawnSync('npm', ['audit', '--audit-level=high', '--json'], {
  encoding: 'utf8',
  shell: process.platform === 'win32',
});

const output = audit.stdout?.trim() || '{}';
writeFileSync(reportPath, `${output}\n`);

if (audit.stderr) {
  process.stderr.write(audit.stderr);
}

let metadata;
try {
  metadata = JSON.parse(output).metadata;
} catch {
  metadata = undefined;
}

const vulnerabilities = metadata?.vulnerabilities;
if (vulnerabilities) {
  console.log(
    `npm audit summary: ${vulnerabilities.critical} critical, ${vulnerabilities.high} high, ${vulnerabilities.moderate} moderate, ${vulnerabilities.low} low vulnerabilities.`,
  );
}

if (audit.status !== 0) {
  console.error(`npm audit failed. Full JSON report written to ${reportPath}.`);
  process.exit(audit.status ?? 1);
}

console.log(`npm audit passed. Full JSON report written to ${reportPath}.`);
