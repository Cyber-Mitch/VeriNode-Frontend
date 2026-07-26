import { describe, expect, it } from 'vitest';
import {
  analyzeCanary,
  buildRunbookExecutionPlan,
  normalizePagerDutyIncident,
  selectRunbook,
} from '../incidentRunbookAutomation';

const pagerDutyPayload = {
  event_action: 'trigger',
  dedup_key: 'incident-128',
  payload: {
    service_id: 'validators-api',
    service_name: 'Validators API',
    summary: 'P99 latency elevated',
    severity: 'critical',
    source: 'pagerduty-events-v2',
    timestamp: '2026-07-25T00:00:00.000Z',
  },
};

describe('incident runbook automation', () => {
  it('normalizes PagerDuty events into the incident contract', () => {
    const incident = normalizePagerDutyIncident(pagerDutyPayload);

    expect(incident).toMatchObject({
      eventAction: 'trigger',
      dedupKey: 'incident-128',
      serviceId: 'validators-api',
      severity: 'critical',
    });
  });

  it('selects matching runbooks and builds critical-path guardrails', () => {
    const incident = normalizePagerDutyIncident(pagerDutyPayload);
    const runbook = selectRunbook(incident);

    expect(runbook?.id).toBe('validator-critical-path');

    const plan = buildRunbookExecutionPlan(incident, runbook!);
    expect(plan.priority).toBe(0);
    expect(plan.actions).toContain('enforce <100ms P99 SLO guardrail');
    expect(plan.actions).toContain('verify 99.99% availability budget');
    expect(plan.pagerDutyEscalationPolicyId).toBe('PD-VALIDATOR-PLATFORM');
  });

  it('promotes healthy canaries', () => {
    expect(
      analyzeCanary([{ timestampMs: 1, errorRate: 0.001, p99LatencyMs: 72, availability: 0.99995 }]),
    ).toEqual({ status: 'promote', reasons: ['canary meets latency, availability, and error-rate targets'] });
  });

  it('rolls back canaries that breach multiple production targets', () => {
    const result = analyzeCanary([{ timestampMs: 1, errorRate: 0.02, p99LatencyMs: 135, availability: 0.999 }]);

    expect(result.status).toBe('rollback');
    expect(result.reasons).toHaveLength(3);
  });
});
