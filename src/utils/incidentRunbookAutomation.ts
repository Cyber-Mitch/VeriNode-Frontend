import type {
  CanaryAnalysisResult,
  CanarySample,
  IncidentSeverity,
  PagerDutyIncidentPayload,
  RunbookDefinition,
  RunbookExecutionPlan,
} from '@/src/types/incidentResponse';

const SEVERITY_PRIORITY: Record<IncidentSeverity, number> = {
  critical: 0,
  error: 1,
  warning: 2,
  info: 3,
};

export const DEFAULT_RUNBOOKS: RunbookDefinition[] = [
  {
    id: 'validator-critical-path',
    title: 'Validator critical path degradation',
    serviceIds: ['validators-api', 'node-status-stream'],
    severity: ['critical', 'error'],
    dashboardUrl: '/network?panel=validator-critical-path',
    ownerTeam: 'validator-platform',
    automationSteps: [
      'page primary validator-platform responder',
      'freeze non-essential validator polling',
      'enable cached beacon RPC fallback',
      'start blue-green rollback readiness check',
    ],
    rollbackSteps: ['route reads to previous green pool', 'disable experimental polling workers'],
    canaryMetric: 'validator_status_p99_latency_ms',
    pagerDutyEscalationPolicyId: 'PD-VALIDATOR-PLATFORM',
  },
  {
    id: 'wallet-transaction-failures',
    title: 'Wallet transaction signing failures',
    serviceIds: ['wallet', 'bridge-transactions'],
    severity: ['critical', 'error', 'warning'],
    dashboardUrl: '/wallet?panel=transaction-health',
    ownerTeam: 'wallet-experience',
    automationSteps: [
      'page wallet-experience responder',
      'pause automatic retry queue drain',
      'switch bridge quotes to safe read-only mode',
    ],
    rollbackSteps: ['restore previous wallet adapter bundle', 'flush failed transaction replay queue'],
    canaryMetric: 'wallet_tx_success_rate',
    pagerDutyEscalationPolicyId: 'PD-WALLET-EXPERIENCE',
  },
];

export function normalizePagerDutyIncident(input: Record<string, unknown>): PagerDutyIncidentPayload {
  const payload = (input.payload ?? input) as Record<string, unknown>;
  const severity = normalizeSeverity(payload.severity);

  return {
    eventAction: normalizeEventAction(input.event_action ?? payload.event_action),
    dedupKey: String(input.dedup_key ?? payload.dedup_key ?? payload.id ?? 'unknown-incident'),
    serviceId: String(payload.service_id ?? payload.service?.toString() ?? 'unknown-service'),
    serviceName: String(payload.service_name ?? payload.service ?? 'Unknown service'),
    summary: String(payload.summary ?? payload.title ?? 'PagerDuty incident'),
    severity,
    source: String(payload.source ?? 'pagerduty'),
    component: payload.component ? String(payload.component) : undefined,
    customDetails: isRecord(payload.custom_details) ? payload.custom_details : undefined,
    occurredAt: String(payload.timestamp ?? payload.occurred_at ?? new Date(0).toISOString()),
  };
}

export function selectRunbook(
  incident: PagerDutyIncidentPayload,
  runbooks: RunbookDefinition[] = DEFAULT_RUNBOOKS,
): RunbookDefinition | undefined {
  return runbooks
    .filter((runbook) => runbook.serviceIds.includes(incident.serviceId))
    .filter((runbook) => runbook.severity.includes(incident.severity))
    .sort((a, b) => bestSeverityRank(a, incident.severity) - bestSeverityRank(b, incident.severity))[0];
}

export function buildRunbookExecutionPlan(
  incident: PagerDutyIncidentPayload,
  runbook: RunbookDefinition,
): RunbookExecutionPlan {
  const priority = SEVERITY_PRIORITY[incident.severity];
  const criticalGuardrails = priority === 0 ? ['enforce <100ms P99 SLO guardrail', 'verify 99.99% availability budget'] : [];

  return {
    incidentId: incident.dedupKey,
    runbookId: runbook.id,
    title: `${runbook.title}: ${incident.summary}`,
    ownerTeam: runbook.ownerTeam,
    priority,
    actions: [...runbook.automationSteps, ...criticalGuardrails],
    dashboardUrl: runbook.dashboardUrl,
    rollbackSteps: runbook.rollbackSteps,
    pagerDutyEscalationPolicyId: runbook.pagerDutyEscalationPolicyId,
    annotations: {
      source: incident.source,
      service: incident.serviceName,
      severity: incident.severity,
      canaryMetric: runbook.canaryMetric,
    },
  };
}

export function analyzeCanary(samples: CanarySample[]): CanaryAnalysisResult {
  if (samples.length === 0) return { status: 'hold', reasons: ['no canary samples available'] };

  const newest = samples.reduce((latest, sample) => (sample.timestampMs > latest.timestampMs ? sample : latest));
  const reasons: string[] = [];

  if (newest.p99LatencyMs >= 100) reasons.push(`p99 latency ${newest.p99LatencyMs}ms breaches 100ms target`);
  if (newest.availability < 0.9999) reasons.push(`availability ${newest.availability} is below 99.99% target`);
  if (newest.errorRate >= 0.01) reasons.push(`error rate ${newest.errorRate} breaches 1% canary threshold`);

  if (reasons.length >= 2) return { status: 'rollback', reasons };
  if (reasons.length === 1) return { status: 'hold', reasons };
  return { status: 'promote', reasons: ['canary meets latency, availability, and error-rate targets'] };
}

function normalizeSeverity(value: unknown): IncidentSeverity {
  if (value === 'critical' || value === 'error' || value === 'warning' || value === 'info') return value;
  return 'info';
}

function normalizeEventAction(value: unknown): PagerDutyIncidentPayload['eventAction'] {
  if (value === 'acknowledge' || value === 'resolve') return value;
  return 'trigger';
}

function bestSeverityRank(runbook: RunbookDefinition, severity: IncidentSeverity): number {
  const directRank = runbook.severity.indexOf(severity);
  return directRank === -1 ? Number.MAX_SAFE_INTEGER : directRank;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
