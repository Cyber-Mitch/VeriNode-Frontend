/**
 * Staging chaos engineering guardrails and experiment registry.
 *
 * The data in this module is intentionally pure/static so CI, runbooks, and
 * operator dashboards can share one source of truth for approved experiments.
 */

export type ChaosService =
  | 'web-app'
  | 'wallet-adapter'
  | 'stellar-rpc'
  | 'indexer'
  | 'notification-worker'
  | 'observability'

export type ChaosFaultType = 'latency' | 'dependency-outage' | 'packet-loss' | 'resource-pressure' | 'process-kill'

export type ChaosAbortCondition = {
  readonly metric: string
  readonly operator: '>=' | '>' | '<=' | '<'
  readonly threshold: number
  readonly durationMinutes: number
}

export type ChaosExperiment = {
  readonly id: string
  readonly title: string
  readonly services: readonly ChaosService[]
  readonly faultType: ChaosFaultType
  readonly blastRadiusPercent: number
  readonly maxDurationMinutes: number
  readonly steadyStateHypothesis: string
  readonly abortConditions: readonly ChaosAbortCondition[]
  readonly requiredApprovals: readonly string[]
  readonly dashboardPanels: readonly string[]
  readonly runbook: string
}

export type ChaosReadinessResult = {
  readonly ready: boolean
  readonly blockers: readonly string[]
}

export const CHAOS_LATENCY_P99_TARGET_MS = 100
export const CHAOS_AVAILABILITY_TARGET_PERCENT = 99.99
export const CHAOS_MAX_BLAST_RADIUS_PERCENT = 10
export const CHAOS_MAX_DURATION_MINUTES = 30

export const defaultChaosAbortConditions: readonly ChaosAbortCondition[] = [
  {
    metric: 'critical_path_p99_ms',
    operator: '>',
    threshold: CHAOS_LATENCY_P99_TARGET_MS,
    durationMinutes: 3,
  },
  {
    metric: 'synthetic_availability_percent',
    operator: '<',
    threshold: CHAOS_AVAILABILITY_TARGET_PERCENT,
    durationMinutes: 2,
  },
  {
    metric: 'error_budget_burn_rate',
    operator: '>=',
    threshold: 2,
    durationMinutes: 5,
  },
  {
    metric: 'security_alert_count',
    operator: '>',
    threshold: 0,
    durationMinutes: 1,
  },
]

export const stagingChaosExperiments: readonly ChaosExperiment[] = [
  {
    id: 'chaos-stg-rpc-latency',
    title: 'Inject Stellar RPC latency on read paths',
    services: ['web-app', 'stellar-rpc', 'indexer'],
    faultType: 'latency',
    blastRadiusPercent: 5,
    maxDurationMinutes: 15,
    steadyStateHypothesis: 'Critical read paths remain below 100 ms P99 through cache fallback and bounded retries.',
    abortConditions: defaultChaosAbortConditions,
    requiredApprovals: ['SRE', 'Security', 'Frontend owner'],
    dashboardPanels: ['Critical path P99', 'RPC fallback rate', 'Synthetic transaction success', 'Error budget burn'],
    runbook: 'docs/chaos-engineering-staging.md#stellar-rpc-latency-injection',
  },
  {
    id: 'chaos-stg-wallet-adapter-failover',
    title: 'Disable primary wallet adapter endpoint',
    services: ['web-app', 'wallet-adapter'],
    faultType: 'dependency-outage',
    blastRadiusPercent: 10,
    maxDurationMinutes: 20,
    steadyStateHypothesis: 'Wallet connection UX degrades gracefully and recovery banners render without blocking dashboards.',
    abortConditions: defaultChaosAbortConditions,
    requiredApprovals: ['SRE', 'Security', 'Product owner'],
    dashboardPanels: ['Wallet connect success', 'Wallet error rate', 'Frontend web vitals', 'Support contact rate'],
    runbook: 'docs/chaos-engineering-staging.md#wallet-adapter-failover',
  },
  {
    id: 'chaos-stg-worker-resource-pressure',
    title: 'Apply CPU and memory pressure to notification workers',
    services: ['notification-worker', 'observability'],
    faultType: 'resource-pressure',
    blastRadiusPercent: 5,
    maxDurationMinutes: 10,
    steadyStateHypothesis: 'Worker queues drain after autoscaling and alert delivery latency remains inside staging SLOs.',
    abortConditions: defaultChaosAbortConditions,
    requiredApprovals: ['SRE', 'Backend owner', 'Security'],
    dashboardPanels: ['Worker CPU saturation', 'Queue depth', 'Alert delivery latency', 'Autoscaler decisions'],
    runbook: 'docs/chaos-engineering-staging.md#notification-worker-resource-pressure',
  },
]

export function evaluateChaosReadiness(experiment: ChaosExperiment): ChaosReadinessResult {
  const blockers: string[] = []

  if (experiment.blastRadiusPercent <= 0 || experiment.blastRadiusPercent > CHAOS_MAX_BLAST_RADIUS_PERCENT) {
    blockers.push(`Blast radius must be between 1% and ${CHAOS_MAX_BLAST_RADIUS_PERCENT}%.`)
  }

  if (experiment.maxDurationMinutes <= 0 || experiment.maxDurationMinutes > CHAOS_MAX_DURATION_MINUTES) {
    blockers.push(`Duration must be between 1 and ${CHAOS_MAX_DURATION_MINUTES} minutes.`)
  }

  if (!experiment.requiredApprovals.includes('Security')) {
    blockers.push('Security approval is required before staging chaos execution.')
  }

  if (experiment.abortConditions.length === 0) {
    blockers.push('At least one automated abort condition is required.')
  }

  if (experiment.dashboardPanels.length < 3) {
    blockers.push('At least three dashboard panels are required for operator visibility.')
  }

  return { ready: blockers.length === 0, blockers }
}

export function listReadyChaosExperiments(
  experiments: readonly ChaosExperiment[] = stagingChaosExperiments,
): readonly ChaosExperiment[] {
  return experiments.filter((experiment) => evaluateChaosReadiness(experiment).ready)
}
