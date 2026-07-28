import { describe, expect, it } from 'vitest'
import { analyzeCanary, auditRuntimeConfig, buildDriftAlerts, detectConfigDrift, fingerprintConfig } from '../runtimeConfigAudit'

const baseline = {
  rpcEndpoint: 'https://rpc.primary.example',
  featureFlags: { bridge: true, withdrawals: false },
  limits: { maxValidators: 100 },
  apiToken: 'baseline-secret',
}

describe('runtimeConfigAudit', () => {
  it('creates stable fingerprints independent of key order and redacts secrets', () => {
    const reordered = {
      apiToken: 'different-secret',
      limits: { maxValidators: 100 },
      featureFlags: { withdrawals: false, bridge: true },
      rpcEndpoint: 'https://rpc.primary.example',
    }

    expect(fingerprintConfig(baseline)).toBe(fingerprintConfig(reordered))
  })

  it('detects added, removed, and changed drift findings with severity classification', () => {
    const findings = detectConfigDrift(baseline, {
      rpcEndpoint: 'https://rpc.backup.example',
      featureFlags: { bridge: true },
      limits: { maxValidators: 100 },
      newTelemetrySink: 'otlp://collector',
      apiToken: 'runtime-secret',
    })

    expect(findings.map((finding) => [finding.path, finding.changeType, finding.severity])).toEqual([
      ['apiToken', 'changed', 'warning'],
      ['featureFlags.withdrawals', 'removed', 'critical'],
      ['newTelemetrySink', 'added', 'info'],
      ['rpcEndpoint', 'changed', 'critical'],
    ])
    expect(findings.find((finding) => finding.path === 'apiToken')?.expected).toBe('[REDACTED]')
  })

  it('builds auditable events and dashboard metrics for drift', () => {
    const audit = auditRuntimeConfig(baseline, { ...baseline, rpcEndpoint: 'https://rpc.backup.example' }, {
      service: 'validator-dashboard',
      environment: 'production',
      approvedBy: 'security-review',
      observedAt: 1_700_000_000_000,
    })

    expect(audit.driftDetected).toBe(true)
    expect(audit.metrics).toEqual({ totalFindings: 1, criticalFindings: 1, warningFindings: 0, infoFindings: 0 })
    expect(audit.auditEvents).toHaveLength(2)
    expect(audit.auditEvents[0]).toMatchObject({ eventType: 'runtime_config_audited', severity: 'critical' })
  })

  it('emits alert payloads only for warning and critical findings', () => {
    const audit = auditRuntimeConfig(baseline, { ...baseline, rpcEndpoint: 'https://rpc.backup.example', optionalBanner: true }, {
      service: 'validator-dashboard',
      environment: 'production',
      approvedBy: 'platform',
    })

    const alerts = buildDriftAlerts(audit)

    expect(alerts).toHaveLength(1)
    expect(alerts[0]).toMatchObject({ severity: 'critical', labels: { service: 'validator-dashboard', environment: 'production', path: 'rpcEndpoint' } })
  })

  it('rolls back canaries when critical drift or availability regression is observed', () => {
    const result = analyzeCanary({
      baseline,
      candidate: { ...baseline, rpcEndpoint: 'https://rpc.unapproved.example' },
      service: 'validator-dashboard',
      environment: 'production',
      approvedBy: 'sre',
      observedHealthyPercent: 99.9,
    })

    expect(result.decision).toBe('rollback')
    expect(result.reasons).toContain('critical drift findings 1 exceed 0')
    expect(result.reasons).toContain('health 99.9% is below 99.99%')
  })

  it('promotes clean canaries at the 99.99% availability target', () => {
    const result = analyzeCanary({
      baseline,
      candidate: baseline,
      service: 'validator-dashboard',
      environment: 'production',
      approvedBy: 'sre',
      observedHealthyPercent: 99.99,
    })

    expect(result.decision).toBe('promote')
    expect(result.reasons).toEqual([])
  })
})
