// Service Level Objective monitoring and burn-rate alert types.

export type SloWindow = '5m' | '30m' | '1h' | '6h' | '24h';
export type SloSeverity = 'healthy' | 'warning' | 'critical';
export type SliType = 'availability' | 'latency';

export interface SloObjective {
  id: string;
  name: string;
  service: string;
  sliType: SliType;
  target: number;
  windowDays: number;
  description: string;
}

export interface SliWindowSample {
  window: SloWindow;
  goodEvents: number;
  totalEvents: number;
  p99LatencyMs?: number;
  capturedAt: number;
}

export interface SloEvaluation {
  objective: SloObjective;
  sample: SliWindowSample;
  observed: number;
  errorBudgetConsumedRatio: number;
  burnRate: number;
  timeToExhaustionHours: number | null;
  severity: SloSeverity;
  reasons: string[];
}

export interface BurnRateAlertPolicy {
  pageBurnRate: number;
  ticketBurnRate: number;
  latencyP99Ms: number;
}
