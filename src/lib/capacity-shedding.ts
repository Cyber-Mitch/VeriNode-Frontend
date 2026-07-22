import { getItem, setItem } from '@/src/lib/sessionStore';

export type CapacityLevel = 'healthy' | 'degraded' | 'critical';

export type ShedPriority = 'critical' | 'high' | 'medium' | 'low';

export interface FeaturePriority {
  feature: string;
  priority: ShedPriority;
}

export interface CapacityThresholds {
  responseTime: number;
  queueSize: number;
  errorRate: number;
  memoryUsage: number;
}

export interface CapacityMetrics {
  responseTime: number;
  queueSize: number;
  errorRate: number;
  memoryUsage: number;
}

const DEFAULT_THRESHOLDS: CapacityThresholds = {
  responseTime: 5000,
  queueSize: 10,
  errorRate: 0.1,
  memoryUsage: 0.8,
};

const METRICS_HISTORY_KEY = 'vn_capacity_history';
const MAX_HISTORY = 20;

let metricsHistory: CapacityMetrics[] = [];
let currentLevel: CapacityLevel = 'healthy';
let listeners: Array<(level: CapacityLevel) => void> = [];

function loadHistory(): void {
  const stored = getItem<CapacityMetrics[]>(METRICS_HISTORY_KEY);
  if (stored) metricsHistory = stored.slice(-MAX_HISTORY);
}

function saveHistory(): void {
  setItem(METRICS_HISTORY_KEY, metricsHistory.slice(-MAX_HISTORY));
}

export function getCurrentLevel(): CapacityLevel {
  return currentLevel;
}

export function getMetricsHistory(): CapacityMetrics[] {
  return [...metricsHistory];
}

export function subscribeToLevelChanges(cb: (level: CapacityLevel) => void): () => void {
  listeners.push(cb);
  return () => {
    listeners = listeners.filter(l => l !== cb);
  };
}

export function recordMetrics(metrics: CapacityMetrics, thresholds?: Partial<CapacityThresholds>): CapacityLevel {
  const t = { ...DEFAULT_THRESHOLDS, ...thresholds };
  metricsHistory.push(metrics);
  saveHistory();

  let shedCount = 0;
  if (metrics.responseTime > t.responseTime) shedCount++;
  if (metrics.queueSize > t.queueSize) shedCount++;
  if (metrics.errorRate > t.errorRate) shedCount++;
  if (metrics.memoryUsage > t.memoryUsage) shedCount++;

  let newLevel: CapacityLevel;
  if (shedCount === 0) {
    newLevel = 'healthy';
  } else if (shedCount <= 1) {
    newLevel = 'degraded';
  } else {
    newLevel = 'critical';
  }

  if (newLevel !== currentLevel) {
    currentLevel = newLevel;
    for (const cb of listeners) cb(currentLevel);
  }

  return currentLevel;
}

export function isFeatureShed(
  feature: string,
  featurePriorities: FeaturePriority[],
  level: CapacityLevel,
): boolean {
  if (level === 'healthy') return false;
  const entry = featurePriorities.find(f => f.feature === feature);
  if (!entry) return false;

  if (level === 'critical') {
    return entry.priority !== 'critical';
  }

  if (level === 'degraded') {
    return entry.priority === 'low';
  }

  return false;
}

export const FEATURE_PRIORITIES: FeaturePriority[] = [
  { feature: 'staking', priority: 'critical' },
  { feature: 'governance', priority: 'high' },
  { feature: 'collateral', priority: 'high' },
  { feature: 'quadratic-voting', priority: 'medium' },
  { feature: 'notification', priority: 'medium' },
  { feature: 'explorer', priority: 'low' },
  { feature: 'analytics', priority: 'low' },
];

loadHistory();
