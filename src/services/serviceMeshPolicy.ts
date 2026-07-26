/**
 * Service mesh policy helpers for VeriNode edge and API services.
 *
 * These helpers keep the operational mTLS/SLO contract testable in source code
 * so Kubernetes/Istio manifests, dashboards, and runbooks can share the same
 * rollout gates instead of duplicating thresholds in prose only.
 */

export type MeshMode = 'STRICT' | 'PERMISSIVE' | 'DISABLE'
export type MeshRolloutPhase = 'baseline' | 'canary' | 'blue' | 'green' | 'promote'

export interface MeshServicePolicy {
  service: string
  namespace: string
  meshMode: MeshMode
  criticalPathP99Ms: number
  availabilityTarget: number
  canaryPercent: number
  errorBudgetBurnRate: number
  certificateTtlHours: number
  telemetrySampleRate: number
}

export interface MeshRuntimeMetrics {
  p99LatencyMs: number
  availability: number
  mtlsSuccessRate: number
  errorBudgetBurnRate: number
  certificateExpiresInHours: number
}

export interface MeshGateResult {
  allowed: boolean
  reasons: string[]
}

export const DEFAULT_MESH_POLICY: MeshServicePolicy = Object.freeze({
  service: 'verinode-frontend',
  namespace: 'verinode',
  meshMode: 'STRICT',
  criticalPathP99Ms: 100,
  availabilityTarget: 99.99,
  canaryPercent: 10,
  errorBudgetBurnRate: 1,
  certificateTtlHours: 24,
  telemetrySampleRate: 1,
})

const SERVICE_NAME_PATTERN = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/

export function normalizeMeshPolicy(overrides: Partial<MeshServicePolicy> = {}): MeshServicePolicy {
  const policy = { ...DEFAULT_MESH_POLICY, ...overrides }

  if (!SERVICE_NAME_PATTERN.test(policy.service)) {
    throw new Error('service must be a valid Kubernetes DNS label')
  }

  if (!SERVICE_NAME_PATTERN.test(policy.namespace)) {
    throw new Error('namespace must be a valid Kubernetes DNS label')
  }

  if (policy.meshMode !== 'STRICT') {
    throw new Error('meshMode must be STRICT for production mTLS enforcement')
  }

  if (policy.criticalPathP99Ms > DEFAULT_MESH_POLICY.criticalPathP99Ms) {
    throw new Error('criticalPathP99Ms cannot exceed the 100ms P99 target')
  }

  if (policy.availabilityTarget < DEFAULT_MESH_POLICY.availabilityTarget) {
    throw new Error('availabilityTarget cannot be below 99.99%')
  }

  if (policy.canaryPercent <= 0 || policy.canaryPercent > 25) {
    throw new Error('canaryPercent must be between 1 and 25')
  }

  if (policy.errorBudgetBurnRate <= 0 || policy.errorBudgetBurnRate > 1) {
    throw new Error('errorBudgetBurnRate must be > 0 and <= 1')
  }

  if (policy.certificateTtlHours < 1 || policy.certificateTtlHours > 24) {
    throw new Error('certificateTtlHours must be between 1 and 24 hours')
  }

  if (policy.telemetrySampleRate <= 0 || policy.telemetrySampleRate > 1) {
    throw new Error('telemetrySampleRate must be > 0 and <= 1')
  }

  return policy
}

export function evaluateMeshPromotionGate(
  metrics: MeshRuntimeMetrics,
  policy: MeshServicePolicy = DEFAULT_MESH_POLICY,
): MeshGateResult {
  const normalized = normalizeMeshPolicy(policy)
  const reasons: string[] = []

  if (metrics.p99LatencyMs > normalized.criticalPathP99Ms) {
    reasons.push(`p99 latency ${metrics.p99LatencyMs}ms exceeds ${normalized.criticalPathP99Ms}ms`)
  }

  if (metrics.availability < normalized.availabilityTarget) {
    reasons.push(`availability ${metrics.availability}% is below ${normalized.availabilityTarget}%`)
  }

  if (metrics.mtlsSuccessRate < 100) {
    reasons.push(`mTLS success rate ${metrics.mtlsSuccessRate}% is below 100%`)
  }

  if (metrics.errorBudgetBurnRate > normalized.errorBudgetBurnRate) {
    reasons.push(`error budget burn ${metrics.errorBudgetBurnRate} exceeds ${normalized.errorBudgetBurnRate}`)
  }

  if (metrics.certificateExpiresInHours < 2) {
    reasons.push('workload certificate expires in less than 2 hours')
  }

  return { allowed: reasons.length === 0, reasons }
}

export function buildMeshTrafficWeights(phase: MeshRolloutPhase, canaryPercent = DEFAULT_MESH_POLICY.canaryPercent) {
  const canary = normalizeMeshPolicy({ canaryPercent }).canaryPercent

  switch (phase) {
    case 'baseline':
    case 'blue':
      return { blue: 100, green: 0, canary: 0 }
    case 'canary':
      return { blue: 100 - canary, green: 0, canary }
    case 'green':
      return { blue: 0, green: 100, canary: 0 }
    case 'promote':
      return { blue: 0, green: 100, canary: 0 }
    default:
      phase satisfies never
      throw new Error('unsupported rollout phase')
  }
}
