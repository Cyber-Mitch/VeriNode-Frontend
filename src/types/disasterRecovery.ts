export type RegionRole = 'primary' | 'secondary' | 'observer'
export type RegionStatus = 'healthy' | 'degraded' | 'unavailable'
export type ReplicationMode = 'sync' | 'async'
export type FailoverDecision = 'stay-primary' | 'promote-secondary' | 'manual-review'
export type DrillStatus = 'pass' | 'warn' | 'fail'

export interface ReplicationRegion {
  id: string
  displayName: string
  role: RegionRole
  status: RegionStatus
  p99LatencyMs: number
  replicationLagMs: number
  lastHeartbeatAt: number
  dataResidency: string
}

export interface ReplicationPolicy {
  mode: ReplicationMode
  criticalPathP99TargetMs: number
  maxReplicationLagMs: number
  heartbeatTimeoutMs: number
  availabilityTarget: number
  canaryErrorBudgetPercent: number
  canaryLatencyBudgetMs: number
}

export interface ReplicationHealth {
  regionId: string
  status: DrillStatus
  messages: string[]
}

export interface FailoverPlan {
  decision: FailoverDecision
  targetRegionId: string | null
  reason: string
  runbookSteps: string[]
}

export interface DisasterRecoveryDrillResult {
  status: DrillStatus
  rpoMs: number
  rtoMs: number
  availabilityPercent: number
  canaryPassed: boolean
  findings: string[]
}
