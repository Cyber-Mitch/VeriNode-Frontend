import type {
  BurnRateAlertPolicy,
  SliWindowSample,
  SloEvaluation,
  SloObjective,
  SloSeverity,
} from '@/src/types/slo';

export const DEFAULT_SLO_POLICY: BurnRateAlertPolicy = {
  pageBurnRate: 14.4,
  ticketBurnRate: 6,
  latencyP99Ms: 100,
};

export const SYSTEM_SLO_OBJECTIVES: SloObjective[] = [
  {
    id: 'platform-availability',
    name: 'Platform Availability',
    service: 'verinode-platform',
    sliType: 'availability',
    target: 0.9999,
    windowDays: 30,
    description: '99.99% successful critical requests across frontend and API dependencies.',
  },
  {
    id: 'critical-path-latency',
    name: 'Critical Path Latency',
    service: 'critical-user-flows',
    sliType: 'latency',
    target: 0.99,
    windowDays: 30,
    description: 'P99 latency for wallet, validator, and monitoring critical paths stays below 100ms.',
  },
];

const WINDOW_HOURS: Record<SliWindowSample['window'], number> = {
  '5m': 5 / 60,
  '30m': 0.5,
  '1h': 1,
  '6h': 6,
  '24h': 24,
};

function clamp(value: number, min = 0, max = Number.POSITIVE_INFINITY): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(value, min), max);
}

export function calculateAvailability(goodEvents: number, totalEvents: number): number {
  if (totalEvents <= 0) return 1;
  return clamp(goodEvents / totalEvents, 0, 1);
}

export function calculateBurnRate(
  objective: SloObjective,
  sample: SliWindowSample,
): number {
  const errorBudgetRatio = 1 - objective.target;
  if (errorBudgetRatio <= 0) return 0;

  if (objective.sliType === 'latency') {
    const latencyViolation = sample.p99LatencyMs !== undefined && sample.p99LatencyMs > DEFAULT_SLO_POLICY.latencyP99Ms;
    if (!latencyViolation) return 0;
  }

  const observed = calculateAvailability(sample.goodEvents, sample.totalEvents);
  const observedErrorRatio = 1 - observed;
  return clamp(observedErrorRatio / errorBudgetRatio);
}

export function deriveSloSeverity(
  burnRate: number,
  policy: BurnRateAlertPolicy = DEFAULT_SLO_POLICY,
): SloSeverity {
  if (burnRate >= policy.pageBurnRate) return 'critical';
  if (burnRate >= policy.ticketBurnRate) return 'warning';
  return 'healthy';
}

export function estimateTimeToExhaustionHours(
  objective: SloObjective,
  burnRate: number,
  consumedRatio: number,
): number | null {
  if (burnRate <= 0 || consumedRatio >= 1) return consumedRatio >= 1 ? 0 : null;
  const remainingRatio = Math.max(0, 1 - consumedRatio);
  return (remainingRatio * objective.windowDays * 24) / burnRate;
}

export function evaluateSloWindow(
  objective: SloObjective,
  sample: SliWindowSample,
  policy: BurnRateAlertPolicy = DEFAULT_SLO_POLICY,
): SloEvaluation {
  const observed = calculateAvailability(sample.goodEvents, sample.totalEvents);
  const burnRate = calculateBurnRate(objective, sample);
  const windowHours = WINDOW_HOURS[sample.window];
  const windowBudgetRatio = windowHours / (objective.windowDays * 24);
  const consumedRatio = clamp(burnRate * windowBudgetRatio, 0, 1);
  const severity = deriveSloSeverity(burnRate, policy);
  const reasons: string[] = [];

  if (objective.sliType === 'latency' && sample.p99LatencyMs !== undefined && sample.p99LatencyMs > policy.latencyP99Ms) {
    reasons.push(`P99 latency ${sample.p99LatencyMs}ms exceeds ${policy.latencyP99Ms}ms target`);
  }
  if (observed < objective.target) {
    reasons.push(`Observed SLI ${(observed * 100).toFixed(3)}% below ${(objective.target * 100).toFixed(2)}% objective`);
  }
  if (severity !== 'healthy') {
    reasons.push(`${burnRate.toFixed(1)}x error-budget burn rate requires ${severity === 'critical' ? 'paging' : 'ticket'} response`);
  }

  return {
    objective,
    sample,
    observed,
    errorBudgetConsumedRatio: consumedRatio,
    burnRate,
    timeToExhaustionHours: estimateTimeToExhaustionHours(objective, burnRate, consumedRatio),
    severity,
    reasons,
  };
}

export function generateDemoSloEvaluations(now = Date.now()): SloEvaluation[] {
  const [availability, latency] = SYSTEM_SLO_OBJECTIVES;
  return [
    evaluateSloWindow(availability, { window: '1h', goodEvents: 999_920, totalEvents: 1_000_000, capturedAt: now }),
    evaluateSloWindow(availability, { window: '6h', goodEvents: 5_999_300, totalEvents: 6_000_000, capturedAt: now }),
    evaluateSloWindow(latency, { window: '30m', goodEvents: 46_000, totalEvents: 50_000, p99LatencyMs: 118, capturedAt: now }),
    evaluateSloWindow(latency, { window: '24h', goodEvents: 2_399_850, totalEvents: 2_400_000, p99LatencyMs: 92, capturedAt: now }),
  ];
}
