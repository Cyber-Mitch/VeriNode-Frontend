import { describe, expect, it } from 'vitest'
import {
  DEFAULT_REPLICATION_POLICY,
  createFailoverPlan,
  evaluateReplicationHealth,
  runDisasterRecoveryDrill,
} from '../disasterRecoveryService'
import type { ReplicationRegion } from '@/types/disasterRecovery'

const now = 1_700_000_000_000

function region(overrides: Partial<ReplicationRegion>): ReplicationRegion {
  return {
    id: 'us-east-1',
    displayName: 'US East',
    role: 'primary',
    status: 'healthy',
    p99LatencyMs: 75,
    replicationLagMs: 120,
    lastHeartbeatAt: now - 5_000,
    dataResidency: 'US',
    ...overrides,
  }
}

describe('evaluateReplicationHealth', () => {
  it('passes regions within the <100ms P99 and replication budgets', () => {
    const [health] = evaluateReplicationHealth([region({})], DEFAULT_REPLICATION_POLICY, now)

    expect(health.status).toBe('pass')
    expect(health.messages).toEqual([])
  })

  it('warns when latency exceeds the critical path target', () => {
    const [health] = evaluateReplicationHealth(
      [region({ p99LatencyMs: DEFAULT_REPLICATION_POLICY.criticalPathP99TargetMs + 1 })],
      DEFAULT_REPLICATION_POLICY,
      now,
    )

    expect(health.status).toBe('warn')
    expect(health.messages[0]).toContain('P99 latency')
  })

  it('fails stale heartbeats to drive disaster recovery escalation', () => {
    const [health] = evaluateReplicationHealth(
      [region({ lastHeartbeatAt: now - DEFAULT_REPLICATION_POLICY.heartbeatTimeoutMs - 1 })],
      DEFAULT_REPLICATION_POLICY,
      now,
    )

    expect(health.status).toBe('fail')
    expect(health.messages).toContain('US East heartbeat is stale.')
  })
})

describe('createFailoverPlan', () => {
  it('keeps traffic on a healthy primary', () => {
    const plan = createFailoverPlan([region({})], DEFAULT_REPLICATION_POLICY, now)

    expect(plan.decision).toBe('stay-primary')
    expect(plan.targetRegionId).toBe('us-east-1')
  })

  it('promotes the healthiest secondary when the primary is unavailable', () => {
    const plan = createFailoverPlan(
      [
        region({ status: 'unavailable' }),
        region({ id: 'eu-west-1', displayName: 'EU West', role: 'secondary', p99LatencyMs: 85, replicationLagMs: 110 }),
        region({ id: 'ap-southeast-1', displayName: 'AP Southeast', role: 'secondary', p99LatencyMs: 95, replicationLagMs: 300 }),
      ],
      DEFAULT_REPLICATION_POLICY,
      now,
    )

    expect(plan.decision).toBe('promote-secondary')
    expect(plan.targetRegionId).toBe('eu-west-1')
    expect(plan.runbookSteps).toHaveLength(5)
  })

  it('requires manual review when no secondary is inside RPO guardrails', () => {
    const plan = createFailoverPlan(
      [
        region({ status: 'unavailable' }),
        region({ id: 'eu-west-1', displayName: 'EU West', role: 'secondary', replicationLagMs: 2_000 }),
      ],
      DEFAULT_REPLICATION_POLICY,
      now,
    )

    expect(plan.decision).toBe('manual-review')
    expect(plan.targetRegionId).toBeNull()
  })
})

describe('runDisasterRecoveryDrill', () => {
  it('passes a clean blue-green canary drill', () => {
    const result = runDisasterRecoveryDrill(
      [
        region({}),
        region({ id: 'eu-west-1', displayName: 'EU West', role: 'secondary' }),
      ],
      DEFAULT_REPLICATION_POLICY,
      15_000,
      0.05,
      now,
    )

    expect(result.status).toBe('pass')
    expect(result.canaryPassed).toBe(true)
    expect(result.rpoMs).toBe(120)
  })

  it('fails when RPO or canary error budget exceeds policy', () => {
    const result = runDisasterRecoveryDrill(
      [region({ replicationLagMs: 1_000 })],
      DEFAULT_REPLICATION_POLICY,
      15_000,
      0.5,
      now,
    )

    expect(result.status).toBe('fail')
    expect(result.canaryPassed).toBe(false)
    expect(result.findings).toEqual(expect.arrayContaining([expect.stringContaining('Observed RPO')]))
  })
})
