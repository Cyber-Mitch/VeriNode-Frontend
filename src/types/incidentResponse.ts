export type IncidentSeverity = 'critical' | 'error' | 'warning' | 'info';

export type PagerDutyEventAction = 'trigger' | 'acknowledge' | 'resolve';

export interface PagerDutyIncidentPayload {
  eventAction: PagerDutyEventAction;
  dedupKey: string;
  serviceId: string;
  serviceName: string;
  summary: string;
  severity: IncidentSeverity;
  source: string;
  component?: string;
  customDetails?: Record<string, unknown>;
  occurredAt: string;
}

export interface RunbookDefinition {
  id: string;
  title: string;
  serviceIds: string[];
  severity: IncidentSeverity[];
  dashboardUrl: string;
  ownerTeam: string;
  automationSteps: string[];
  rollbackSteps: string[];
  canaryMetric: string;
  pagerDutyEscalationPolicyId: string;
}

export interface RunbookExecutionPlan {
  incidentId: string;
  runbookId: string;
  title: string;
  ownerTeam: string;
  priority: number;
  actions: string[];
  dashboardUrl: string;
  rollbackSteps: string[];
  pagerDutyEscalationPolicyId: string;
  annotations: Record<string, string>;
}

export interface CanarySample {
  timestampMs: number;
  errorRate: number;
  p99LatencyMs: number;
  availability: number;
}

export interface CanaryAnalysisResult {
  status: 'promote' | 'hold' | 'rollback';
  reasons: string[];
}
