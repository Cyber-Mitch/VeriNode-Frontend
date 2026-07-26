import { describe, expect, it } from 'vitest'
import {
  DEFAULT_MESH_POLICY,
  buildMeshTrafficWeights,
  evaluateMeshPromotionGate,
  normalizeMeshPolicy,
} from '../serviceMeshPolicy'

describe('service mesh policy', () => {
  it('defaults to strict mTLS and issue SLOs', () => {
    expect(DEFAULT_MESH_POLICY.meshMode).toBe('STRICT')
    expect(DEFAULT_MESH_POLICY.criticalPathP99Ms).toBe(100)
    expect(DEFAULT_MESH_POLICY.availabilityTarget).toBe(99.99)
    expect(DEFAULT_MESH_POLICY.certificateTtlHours).toBe(24)
  })

  it('rejects insecure or out-of-bound policy changes', () => {
    expect(() => normalizeMeshPolicy({ meshMode: 'PERMISSIVE' })).toThrow(/STRICT/)
    expect(() => normalizeMeshPolicy({ criticalPathP99Ms: 101 })).toThrow(/100ms/)
    expect(() => normalizeMeshPolicy({ availabilityTarget: 99.9 })).toThrow(/99.99/)
    expect(() => normalizeMeshPolicy({ canaryPercent: 50 })).toThrow(/between 1 and 25/)
  })

  it('allows promotion only when latency, availability, mTLS, burn rate, and cert TTL are healthy', () => {
    expect(
      evaluateMeshPromotionGate({
        p99LatencyMs: 82,
        availability: 99.995,
        mtlsSuccessRate: 100,
        errorBudgetBurnRate: 0.7,
        certificateExpiresInHours: 8,
      }),
    ).toEqual({ allowed: true, reasons: [] })
  })

  it('explains every failed promotion gate', () => {
    const result = evaluateMeshPromotionGate({
      p99LatencyMs: 125,
      availability: 99.95,
      mtlsSuccessRate: 99.99,
      errorBudgetBurnRate: 1.3,
      certificateExpiresInHours: 1,
    })

    expect(result.allowed).toBe(false)
    expect(result.reasons).toHaveLength(5)
  })

  it('builds deterministic blue-green and canary traffic weights', () => {
    expect(buildMeshTrafficWeights('baseline')).toEqual({ blue: 100, green: 0, canary: 0 })
    expect(buildMeshTrafficWeights('canary', 15)).toEqual({ blue: 85, green: 0, canary: 15 })
    expect(buildMeshTrafficWeights('green')).toEqual({ blue: 0, green: 100, canary: 0 })
  })
})
