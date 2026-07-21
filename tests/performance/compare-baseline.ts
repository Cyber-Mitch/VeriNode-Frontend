import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import type { PerfMetrics, PerfBaseline } from './types';

const BASELINE_PATH = join(__dirname, 'baseline.json');
const THRESHOLD_PCT = parseFloat(process.env.PERF_THRESHOLD_PCT || '10');
const ALLOW_UPDATE = process.env.PERF_UPDATE_BASELINE === 'true';

interface ComparisonResult {
  metric: string;
  current: number;
  baseline: number;
  pctChange: number;
  passed: boolean;
}

function loadBaseline(): PerfBaseline | null {
  if (!existsSync(BASELINE_PATH)) return null;
  try {
    return JSON.parse(readFileSync(BASELINE_PATH, 'utf-8'));
  } catch {
    return null;
  }
}

function saveBaseline(metrics: PerfMetrics): void {
  const baseline: PerfBaseline = {
    timestamp: new Date().toISOString(),
    commit: process.env.GITHUB_SHA || 'manual-update',
    metrics,
  };
  writeFileSync(BASELINE_PATH, JSON.stringify(baseline, null, 2));
  console.log(`Baseline saved to ${BASELINE_PATH}`);
}

function compare(current: PerfMetrics, baseline: PerfBaseline): ComparisonResult[] {
  const metricKeys: { label: string; key: keyof PerfMetrics }[] = [
    { label: 'FCP', key: 'fcp' },
    { label: 'LCP', key: 'lcp' },
    { label: 'TTI', key: 'tti' },
    { label: 'DOM Content Loaded', key: 'domContentLoaded' },
    { label: 'Page Load Time', key: 'pageLoadTime' },
    { label: 'JS Heap Used', key: 'jsHeapUsed' },
    { label: 'Total Bytes', key: 'totalBytes' },
    { label: 'Num Requests', key: 'numRequests' },
  ];

  return metricKeys.map(({ label, key }) => {
    const currentVal = current[key];
    const baselineVal = baseline.metrics[key];
    const pctChange = baselineVal > 0
      ? ((currentVal - baselineVal) / baselineVal) * 100
      : 0;
    const passed = pctChange <= THRESHOLD_PCT;

    return { metric: label, current: currentVal, baseline: baselineVal, pctChange: Math.round(pctChange * 100) / 100, passed };
  });
}

function printResults(results: ComparisonResult[]): void {
  console.log('\n=== Performance Regression Check ===\n');
  console.log(`Threshold: ${THRESHOLD_PCT}%\n`);

  const header = `${'Metric'.padEnd(22)} ${'Current'.padEnd(14)} ${'Baseline'.padEnd(14)} ${'Change'.padEnd(10)} Status`;
  console.log(header);
  console.log('-'.repeat(header.length));

  let allPassed = true;
  for (const r of results) {
    const changeStr = `${r.pctChange > 0 ? '+' : ''}${r.pctChange}%`.padEnd(10);
    const status = r.passed ? '\u2713 PASS' : '\u2717 FAIL';
    if (!r.passed) allPassed = false;
    console.log(
      `${r.metric.padEnd(22)} ${String(r.current).padEnd(14)} ${String(r.baseline).padEnd(14)} ${changeStr} ${status}`,
    );
  }

  const passedCount = results.filter((r) => r.passed).length;
  console.log(`\n${passedCount}/${results.length} checks passed\n`);

  if (!allPassed) {
    console.log('\u2717 FAILED: Performance regression detected.');
    process.exit(1);
  }
  console.log('\u2713 PASSED: No performance regression detected.');
}

function main(): void {
  const inputPath = process.argv[2];
  if (!inputPath || !existsSync(inputPath)) {
    console.error('Usage: npx tsx tests/performance/compare-baseline.ts <metrics-json-path>');
    console.error('  or set PERF_UPDATE_BASELINE=true to update baseline');
    process.exit(1);
  }

  let current: PerfMetrics;
  try {
    current = JSON.parse(readFileSync(inputPath, 'utf-8'));
  } catch (e) {
    console.error('Failed to parse metrics file:', e);
    process.exit(1);
  }

  const baseline = loadBaseline();

  if (!baseline) {
    console.log('No baseline found. Saving current metrics as baseline.');
    saveBaseline(current);
    return;
  }

  if (ALLOW_UPDATE) {
    console.log('PERF_UPDATE_BASELINE=true — updating baseline with current metrics.');
    saveBaseline(current);
    return;
  }

  const results = compare(current, baseline);
  printResults(results);
}

main();
