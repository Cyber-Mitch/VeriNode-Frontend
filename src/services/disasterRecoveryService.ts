import type {
  DisasterRecoveryDrillResult,
  FailoverPlan,
  ReplicationHealth,
  ReplicationPolicy,
  ReplicationRegion,
} from '@/types/disasterRecovery'

export const DEFAULT_REPLICATION_POLICY: ReplicationPolicy = {
  mode: 'async',
  criticalPathP99TargetMs: 100,
  maxReplicationLagMs: 500,
  heartbeatTimeoutMs: 30_000,
  availabilityTarget: 99.99,
  canaryErrorBudgetPercent: 0.1,
  canaryLatencyBudgetMs: 100,
}

export const DEFAULT_FAILOVER_RUNBOOK_STEPS = [
  'Freeze writes on the unhealthy primary and snapshot pending queues.',
  'Promote the healthiest secondary region and rotate traffic through the global load balancer.',
  'Run read-after-write, wallet session, bridge transaction, and validator dashboard smoke tests.',
  'Start a 10% canary, compare error rate and P99 latency against budgets, then ramp to 50% and 100%.',
  'Keep replication telemetry and audit logs attached to the incident record for security review.',
]

function isHeartbeatStale(region: ReplicationRegion, policy: ReplicationPolicy, now: number): boolean {
  return now - region.lastHeartbeatAt > policy.heartbeatTimeoutMs
}

function rankPromotionCandidate(region: ReplicationRegion): number {
  const statusPenalty = region.status === 'healthy' ? 0 : region.status === 'degraded' ? 10_000 : 100_000
  return statusPenalty + region.p99LatencyMs + region.replicationLagMs
}

export function evaluateReplicationHealth(
  regions: ReplicationRegion[],
  policy: ReplicationPolicy = DEFAULT_REPLICATION_POLICY,
  now = Date.now(),
): ReplicationHealth[] {
  return regions.map((region) => {
    const messages: string[] = []

    if (region.status !== 'healthy') {
      messages.push(`${region.displayName} reports ${region.status} status.`)
    }

    if (region.p99LatencyMs > policy.criticalPathP99TargetMs) {
      messages.push(
        `${region.displayName} P99 latency is ${region.p99LatencyMs}ms, above the ${policy.criticalPathP99TargetMs}ms target.`,
      )
    }

    if (region.replicationLagMs > policy.maxReplicationLagMs) {
      messages.push(
        `${region.displayName} replication lag is ${region.replicationLagMs}ms, above the ${policy.maxReplicationLagMs}ms RPO guardrail.`,
      )
    }

    if (isHeartbeatStale(region, policy, now)) {
      messages.push(`${region.displayName} heartbeat is stale.`)
    }

    const hasHardFailure = region.status === 'unavailable' || isHeartbeatStale(region, policy, now)
    const status = hasHardFailure ? 'fail' : messages.length > 0 ? 'warn' : 'pass'

    return { regionId: region.id, status, messages }
  })
}

export function createFailoverPlan(
  regions: ReplicationRegion[],
  policy: ReplicationPolicy = DEFAULT_REPLICATION_POLICY,
  now = Date.now(),
): FailoverPlan {
  const primary = regions.find((region) => region.role === 'primary')
  const health = evaluateReplicationHealth(regions, policy, now)
  const primaryHealth = primary ? health.find((item) => item.regionId === primary.id) : null

  if (!primary) {
    return {
      decision: 'manual-review',
      targetRegionId: null,
      reason: 'No primary region is configured.',
      runbookSteps: DEFAULT_FAILOVER_RUNBOOK_STEPS,
    }
  }

  if (primaryHealth?.status !== 'fail') {
    return {
      decision: primaryHealth?.status === 'warn' ? 'manual-review' : 'stay-primary',
      targetRegionId: primary.id,
      reason: primaryHealth?.messages.join(' ') || `${primary.displayName} is within replication and latency budgets.`,
      runbookSteps: DEFAULT_FAILOVER_RUNBOOK_STEPS,
    }
  }

  const candidates = regions
    .filter((region) => region.role === 'secondary')
    .filter((region) => {
      const item = health.find((entry) => entry.regionId === region.id)
      return item?.status !== 'fail' && region.replicationLagMs <= policy.maxReplicationLagMs
    })
    .sort((a, b) => rankPromotionCandidate(a) - rankPromotionCandidate(b))

  if (candidates.length === 0) {
    return {
      decision: 'manual-review',
      targetRegionId: null,
      reason: 'Primary failed, but no secondary region satisfies heartbeat and replication-lag guardrails.',
      runbookSteps: DEFAULT_FAILOVER_RUNBOOK_STEPS,
    }
  }

  return {
    decision: 'promote-secondary',
    targetRegionId: candidates[0].id,
    reason: `${primary.displayName} failed health checks; ${candidates[0].displayName} has the best latency and replication posture.`,
    runbookSteps: DEFAULT_FAILOVER_RUNBOOK_STEPS,
  }
}

export function runDisasterRecoveryDrill(
  regions: ReplicationRegion[],
  policy: ReplicationPolicy = DEFAULT_REPLICATION_POLICY,
  simulatedRecoveryMs: number,
  canaryErrorPercent: number,
  now = Date.now(),
): DisasterRecoveryDrillResult {
  const health = evaluateReplicationHealth(regions, policy, now)
  const findings = health.flatMap((item) => item.messages)
  const rpoMs = Math.max(0, ...regions.map((region) => region.replicationLagMs))
  const rtoMs = simulatedRecoveryMs
  const healthyRegions = health.filter((item) => item.status === 'pass').length
  const availabilityPercent = regions.length === 0 ? 0 : (healthyRegions / regions.length) * 100
  const canaryPassed = canaryErrorPercent <= policy.canaryErrorBudgetPercent && rpoMs <= policy.maxReplicationLagMs

  if (rpoMs > policy.maxReplicationLagMs) {
    findings.push(`Observed RPO ${rpoMs}ms exceeds ${policy.maxReplicationLagMs}ms.`)
  }

  if (rtoMs > policy.heartbeatTimeoutMs) {
    findings.push(`Observed RTO ${rtoMs}ms exceeds ${policy.heartbeatTimeoutMs}ms failover target.`)
  }

  if (!canaryPassed) {
    findings.push('Canary analysis failed; hold blue-green promotion and keep traffic pinned to the stable region.')
  }

  const status = findings.some((finding) => finding.includes('exceeds') || finding.includes('failed'))
    ? 'fail'
    : findings.length > 0 || availabilityPercent < policy.availabilityTarget
      ? 'warn'
      : 'pass'

  return { status, rpoMs, rtoMs, availabilityPercent, canaryPassed, findings }
}
