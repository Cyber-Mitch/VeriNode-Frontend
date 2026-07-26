import { describe, expect, it } from 'vitest';
import { buildCapacityPlan, buildForecasts, linearTrendPerDay, type CapacityUsageSample } from '../services/capacityPlanningService';

const day = 86_400_000;
const base = Date.UTC(2026, 0, 1);

function sample(offset: number, service: string, cpu: number): CapacityUsageSample {
  return { timestamp: base + offset * day, service, metrics: { cpu } };
}

describe('capacityPlanningService', () => {
  it('computes a daily historical trend using least squares', () => {
    expect(linearTrendPerDay([
      { timestamp: base, value: 40 },
      { timestamp: base + day, value: 45 },
      { timestamp: base + 2 * day, value: 50 },
    ])).toBe(5);
  });

  it('forecasts warning and critical thresholds from historical usage', () => {
    const forecasts = buildForecasts([sample(0, 'api', 50), sample(1, 'api', 55), sample(2, 'api', 60)], [
      { service: '*', metric: 'cpu', warning: 70, critical: 85, unit: '%' },
    ]);

    expect(forecasts[0]).toMatchObject({
      service: 'api',
      metric: 'cpu',
      current: 60,
      trendPerDay: 5,
      projected7d: 95,
      daysToWarning: 2,
      daysToCritical: 5,
      status: 'critical',
    });
  });

  it('creates alert and recommendation payloads for dashboards and runbooks', () => {
    const plan = buildCapacityPlan([sample(0, 'validator', 68), sample(1, 'validator', 71), sample(2, 'validator', 74)], [
      { service: '*', metric: 'cpu', warning: 75, critical: 90, unit: '%' },
    ], base + 2 * day);

    expect(plan.windowDays).toBe(2);
    expect(plan.alerts).toHaveLength(1);
    expect(plan.alerts[0].runbook).toBe('docs/runbooks/capacity-planning.md');
    expect(plan.recommendations[0]).toContain('validator cpu');
  });
});
