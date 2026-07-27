import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SLO_POLICY,
  SYSTEM_SLO_OBJECTIVES,
  calculateAvailability,
  calculateBurnRate,
  deriveSloSeverity,
  evaluateSloWindow,
  generateDemoSloEvaluations,
} from './sloMonitoringService';

describe('SLO monitoring service', () => {
  it('calculates availability safely', () => {
    expect(calculateAvailability(9999, 10000)).toBe(0.9999);
    expect(calculateAvailability(1, 0)).toBe(1);
  });

  it('derives burn rate against the objective error budget', () => {
    const objective = SYSTEM_SLO_OBJECTIVES[0];
    const burnRate = calculateBurnRate(objective, {
      window: '1h',
      goodEvents: 999_800,
      totalEvents: 1_000_000,
      capturedAt: 1,
    });
    expect(burnRate).toBeCloseTo(2, 5);
  });

  it('gates latency burn rate on the 100ms P99 target', () => {
    const objective = SYSTEM_SLO_OBJECTIVES[1];
    expect(calculateBurnRate(objective, { window: '5m', goodEvents: 90, totalEvents: 100, p99LatencyMs: 99, capturedAt: 1 })).toBe(0);
    expect(calculateBurnRate(objective, { window: '5m', goodEvents: 90, totalEvents: 100, p99LatencyMs: 101, capturedAt: 1 })).toBeGreaterThan(0);
  });

  it('maps burn rates to ticket and page severities', () => {
    expect(deriveSloSeverity(1)).toBe('healthy');
    expect(deriveSloSeverity(DEFAULT_SLO_POLICY.ticketBurnRate)).toBe('warning');
    expect(deriveSloSeverity(DEFAULT_SLO_POLICY.pageBurnRate)).toBe('critical');
  });

  it('evaluates windows with reasons and time to exhaustion', () => {
    const evaluation = evaluateSloWindow(SYSTEM_SLO_OBJECTIVES[0], {
      window: '30m',
      goodEvents: 99_000,
      totalEvents: 100_000,
      capturedAt: 1,
    });
    expect(evaluation.severity).toBe('critical');
    expect(evaluation.reasons.length).toBeGreaterThan(0);
    expect(evaluation.timeToExhaustionHours).toBeGreaterThan(0);
  });

  it('provides demo evaluations for the dashboard', () => {
    const evaluations = generateDemoSloEvaluations(123);
    expect(evaluations).toHaveLength(4);
    expect(evaluations.some((item) => item.severity !== 'healthy')).toBe(true);
  });

  it('keeps critical-path evaluation under 100ms for 10 000 samples', () => {
    const objective = SYSTEM_SLO_OBJECTIVES[0];
    const start = performance.now();
    for (let i = 0; i < 10_000; i++) {
      evaluateSloWindow(objective, { window: '5m', goodEvents: 9990, totalEvents: 10000, capturedAt: i });
    }
    expect(performance.now() - start).toBeLessThan(100);
  });
});
