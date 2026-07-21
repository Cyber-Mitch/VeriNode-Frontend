import { test, expect } from '@playwright/test';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import type { PerfMetrics, PerfBaseline } from './types';

const BASELINE_PATH = join(__dirname, 'baseline.json');
const OUTPUT_PATH = process.env.PERF_OUTPUT_PATH || join(__dirname, 'current-metrics.json');
const THRESHOLD_PCT = 10;

function loadBaseline(): PerfBaseline | null {
  if (!existsSync(BASELINE_PATH)) return null;
  try {
    return JSON.parse(readFileSync(BASELINE_PATH, 'utf-8')) as PerfBaseline;
  } catch {
    return null;
  }
}

function saveBaseline(metrics: PerfMetrics): void {
  const baseline: PerfBaseline = {
    timestamp: new Date().toISOString(),
    commit: process.env.GITHUB_SHA || 'local',
    metrics,
  };
  writeFileSync(BASELINE_PATH, JSON.stringify(baseline, null, 2));
}

function outputMetrics(metrics: PerfMetrics): void {
  const dir = join(OUTPUT_PATH, '..');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(OUTPUT_PATH, JSON.stringify(metrics, null, 2));
  console.log(`Performance metrics written to ${OUTPUT_PATH}`);
}

function checkRegression(current: PerfMetrics, baseline: PerfBaseline): string[] {
  const failures: string[] = [];
  const checks: [string, keyof PerfMetrics][] = [
    ['FCP', 'fcp'],
    ['LCP', 'lcp'],
    ['TTI', 'tti'],
    ['DOM Content Loaded', 'domContentLoaded'],
    ['Page Load Time', 'pageLoadTime'],
    ['JS Heap Used', 'jsHeapUsed'],
    ['Num Requests', 'numRequests'],
    ['Total Bytes', 'totalBytes'],
  ];

  for (const [label, key] of checks) {
    const currentVal = current[key] as number;
    const baselineVal = baseline.metrics[key] as number;
    if (baselineVal === 0) continue;

    const pctChange = ((currentVal - baselineVal) / baselineVal) * 100;
    if (pctChange > THRESHOLD_PCT) {
      failures.push(
        `${label}: ${currentVal} vs ${baselineVal} (${pctChange.toFixed(1)}% worse, threshold: ${THRESHOLD_PCT}%)`,
      );
    }
  }

  return failures;
}

test.describe('Performance Benchmarks', () => {
  let measured: PerfMetrics;

  test('measure home page performance metrics', async ({ page }) => {
    const startTime = Date.now();

    const response = await page.goto('/', { waitUntil: 'networkidle' });
    const pageLoadTime = Date.now() - startTime;

    const fcp = await page.evaluate(() => {
      return new Promise<number>((resolve) => {
        const observer = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          if (entries.length > 0) {
            observer.disconnect();
            resolve(entries[0].startTime);
          }
        });
        observer.observe({ type: 'paint', buffered: true });
        setTimeout(() => { observer.disconnect(); resolve(0); }, 3000);
      });
    });

    const lcp = await page.evaluate(() => {
      return new Promise<number>((resolve) => {
        const observer = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          if (entries.length > 0) {
            observer.disconnect();
            resolve(entries[entries.length - 1].startTime);
          }
        });
        observer.observe({ type: 'largest-contentful-paint', buffered: true });
        setTimeout(() => { observer.disconnect(); resolve(0); }, 3000);
      });
    });

    const navTiming = await page.evaluate(() => {
      const perf = performance.timing;
      return {
        domInteractive: perf ? perf.domInteractive || 0 : 0,
        navStart: perf ? perf.navigationStart || 0 : 0,
        domContentLoadedEnd: perf ? perf.domContentLoadedEventEnd || 0 : 0,
      };
    });

    const tti = navTiming.domInteractive ? navTiming.domInteractive - navTiming.navStart : 0;
    const domContentLoaded = navTiming.domContentLoadedEnd ? navTiming.domContentLoadedEnd - navTiming.navStart : 0;

    const memoryInfo = await page.evaluate(() => {
      const mem = (performance as unknown as Record<string, unknown>).memory as
        | { usedJSHeapSize: number; totalJSHeapSize: number }
        | undefined;
      return {
        usedJSHeapSize: mem?.usedJSHeapSize || 0,
        totalJSHeapSize: mem?.totalJSHeapSize || 0,
      };
    });

    const perfEntries = await page.evaluate(() => {
      return performance.getEntriesByType('resource').map((e) => ({
        transferSize: (e as PerformanceResourceTiming).transferSize || 0,
      }));
    });

    const numRequests = perfEntries.length;
    const totalBytes = perfEntries.reduce((sum, e) => sum + e.transferSize, 0);
    const totalResponseSize = response ? (await response.body()).length : 0;

    measured = {
      fcp: Math.round(fcp),
      lcp: Math.round(lcp),
      tti: Math.round(tti),
      domContentLoaded: Math.round(domContentLoaded),
      pageLoadTime,
      jsHeapUsed: memoryInfo.usedJSHeapSize,
      jsHeapTotal: memoryInfo.totalJSHeapSize,
      numRequests,
      totalBytes: totalBytes + totalResponseSize,
    };

    outputMetrics(measured);

    const baseline = loadBaseline();

    if (baseline) {
      const regressions = checkRegression(measured, baseline);
      if (regressions.length > 0) {
        const message = [
          'Performance regression detected:',
          ...regressions.map((r) => `  - ${r}`),
        ].join('\n');
        console.error(message);
      }
      expect(regressions).toEqual([]);
    } else {
      console.log('No baseline found, saving current metrics as baseline');
      saveBaseline(measured);
    }

    expect(measured.fcp).toBeLessThan(3000);
    expect(measured.lcp).toBeLessThan(4000);
    expect(measured.pageLoadTime).toBeLessThan(10000);
  });

  test('interaction performance - staking form response time', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });

    const textarea = page.locator('textarea');
    await textarea.fill('AAAA-test-interaction');

    const interactions: number[] = [];
    for (let i = 0; i < 5; i++) {
      const t0 = await page.evaluate(() => performance.now());
      await textarea.click();
      const t1 = await page.evaluate(() => performance.now());
      interactions.push(t1 - t0);
    }

    interactions.sort((a, b) => a - b);
    const p99 = interactions[Math.floor(interactions.length * 0.99)];

    expect(p99).toBeLessThan(100);
  });

  test('memory stability - no leaks after repeated operations', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });

    const snapshots: number[] = [];
    for (let i = 0; i < 10; i++) {
      const mem = await page.evaluate(() => {
        const m = (performance as unknown as Record<string, unknown>).memory as
          | { usedJSHeapSize: number }
          | undefined;
        return m?.usedJSHeapSize || 0;
      });
      snapshots.push(mem);

      await page.locator('textarea').fill(`AAAA-test-iteration-${i}`);
      await page.locator('textarea').click();
    }

    const growth = snapshots[snapshots.length - 1] - snapshots[0];
    const growthMB = growth / 1024 / 1024;

    expect(growthMB).toBeLessThan(5);
  });
});
