export type CapacityMetricName = 'cpu' | 'memory' | 'storage' | 'requestRate' | 'responseTime' | 'errorRate';

export interface CapacityUsageSample {
  timestamp: number;
  service: string;
  metrics: Partial<Record<CapacityMetricName, number>>;
}

export interface CapacityLimit {
  service: string;
  metric: CapacityMetricName;
  warning: number;
  critical: number;
  unit: string;
}

export interface CapacityForecast {
  service: string;
  metric: CapacityMetricName;
  current: number;
  trendPerDay: number;
  projected7d: number;
  projected30d: number;
  daysToWarning: number | null;
  daysToCritical: number | null;
  status: 'healthy' | 'warning' | 'critical';
  unit: string;
}

export interface CapacityPlan {
  generatedAt: number;
  windowDays: number;
  forecasts: CapacityForecast[];
  alerts: CapacityAlert[];
  recommendations: string[];
}

export interface CapacityAlert {
  id: string;
  severity: 'info' | 'warning' | 'critical';
  service: string;
  metric: CapacityMetricName;
  message: string;
  runbook: string;
}

const DAY_MS = 86_400_000;

export const DEFAULT_CAPACITY_LIMITS: CapacityLimit[] = [
  { service: '*', metric: 'cpu', warning: 70, critical: 85, unit: '%' },
  { service: '*', metric: 'memory', warning: 72, critical: 88, unit: '%' },
  { service: '*', metric: 'storage', warning: 75, critical: 90, unit: '%' },
  { service: '*', metric: 'requestRate', warning: 8_000, critical: 10_000, unit: 'rpm' },
  { service: '*', metric: 'responseTime', warning: 75, critical: 100, unit: 'ms p99' },
  { service: '*', metric: 'errorRate', warning: 0.5, critical: 1, unit: '%' },
];

export function buildCapacityPlan(
  samples: CapacityUsageSample[],
  limits: CapacityLimit[] = DEFAULT_CAPACITY_LIMITS,
  now = Date.now(),
): CapacityPlan {
  const windowDays = computeWindowDays(samples, now);
  const forecasts = buildForecasts(samples, limits);
  const alerts = forecasts.flatMap(buildAlert);
  return {
    generatedAt: now,
    windowDays,
    forecasts,
    alerts,
    recommendations: buildRecommendations(forecasts),
  };
}

export function buildForecasts(samples: CapacityUsageSample[], limits: CapacityLimit[]): CapacityForecast[] {
  const grouped = new Map<string, Array<{ timestamp: number; value: number; limit: CapacityLimit }>>();

  for (const sample of samples) {
    for (const [metric, value] of Object.entries(sample.metrics) as Array<[CapacityMetricName, number]>) {
      if (!Number.isFinite(value)) continue;
      const limit = resolveLimit(sample.service, metric, limits);
      if (!limit) continue;
      const key = `${sample.service}:${metric}`;
      grouped.set(key, [...(grouped.get(key) ?? []), { timestamp: sample.timestamp, value, limit }]);
    }
  }

  return [...grouped.entries()].map(([key, points]) => {
    const [service, metric] = key.split(':') as [string, CapacityMetricName];
    points.sort((a, b) => a.timestamp - b.timestamp);
    const latest = points.at(-1)!;
    const trendPerDay = linearTrendPerDay(points.map(({ timestamp, value }) => ({ timestamp, value })));
    const projected7d = round(latest.value + trendPerDay * 7);
    const projected30d = round(latest.value + trendPerDay * 30);
    return {
      service,
      metric,
      current: round(latest.value),
      trendPerDay: round(trendPerDay),
      projected7d,
      projected30d,
      daysToWarning: daysUntil(latest.value, trendPerDay, latest.limit.warning),
      daysToCritical: daysUntil(latest.value, trendPerDay, latest.limit.critical),
      status: latest.value >= latest.limit.critical || projected7d >= latest.limit.critical ? 'critical' : latest.value >= latest.limit.warning || projected30d >= latest.limit.warning ? 'warning' : 'healthy',
      unit: latest.limit.unit,
    };
  });
}

export function linearTrendPerDay(points: Array<{ timestamp: number; value: number }>): number {
  if (points.length < 2) return 0;
  const firstTimestamp = points[0].timestamp;
  const xs = points.map(point => (point.timestamp - firstTimestamp) / DAY_MS);
  const ys = points.map(point => point.value);
  const xMean = average(xs);
  const yMean = average(ys);
  const denominator = xs.reduce((sum, x) => sum + (x - xMean) ** 2, 0);
  if (denominator === 0) return 0;
  const numerator = xs.reduce((sum, x, index) => sum + (x - xMean) * (ys[index] - yMean), 0);
  return numerator / denominator;
}

function resolveLimit(service: string, metric: CapacityMetricName, limits: CapacityLimit[]): CapacityLimit | undefined {
  return limits.find(limit => limit.service === service && limit.metric === metric) ?? limits.find(limit => limit.service === '*' && limit.metric === metric);
}

function buildAlert(forecast: CapacityForecast): CapacityAlert[] {
  if (forecast.status === 'healthy') return [];
  const when = forecast.daysToCritical !== null && forecast.daysToCritical <= 7 ? ` in ${forecast.daysToCritical} days` : '';
  return [{
    id: `${forecast.service}-${forecast.metric}-${forecast.status}`,
    severity: forecast.status,
    service: forecast.service,
    metric: forecast.metric,
    message: `${forecast.service} ${forecast.metric} is ${forecast.status}; current ${forecast.current}${forecast.unit}, 30d projection ${forecast.projected30d}${forecast.unit}${when}.`,
    runbook: 'docs/runbooks/capacity-planning.md',
  }];
}

function buildRecommendations(forecasts: CapacityForecast[]): string[] {
  const risky = forecasts.filter(forecast => forecast.status !== 'healthy');
  if (risky.length === 0) return ['No capacity action required; continue monitoring weekly trend reports.'];
  return risky.map(forecast => `Review ${forecast.service} ${forecast.metric}: add capacity or reduce demand before ${forecast.daysToCritical ?? forecast.daysToWarning ?? 30} days.`);
}

function daysUntil(current: number, trendPerDay: number, threshold: number): number | null {
  if (current >= threshold) return 0;
  if (trendPerDay <= 0) return null;
  return Math.ceil((threshold - current) / trendPerDay);
}

function computeWindowDays(samples: CapacityUsageSample[], now: number): number {
  if (samples.length === 0) return 0;
  const oldest = Math.min(...samples.map(sample => sample.timestamp));
  return Math.ceil((now - oldest) / DAY_MS);
}

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
