import { describe, expect, it } from 'vitest'
import {
  CHAOS_AVAILABILITY_TARGET_PERCENT,
  CHAOS_LATENCY_P99_TARGET_MS,
  CHAOS_MAX_BLAST_RADIUS_PERCENT,
  CHAOS_MAX_DURATION_MINUTES,
  evaluateChaosReadiness,
  listReadyChaosExperiments,
  stagingChaosExperiments,
  type ChaosExperiment,
} from '@/config/chaosEngineering'

describe('staging chaos engineering registry', () => {
  it('keeps default experiments within latency, availability, blast-radius, and duration guardrails', () => {
    expect(CHAOS_LATENCY_P99_TARGET_MS).toBe(100)
    expect(CHAOS_AVAILABILITY_TARGET_PERCENT).toBe(99.99)

    for (const experiment of stagingChaosExperiments) {
      expect(experiment.blastRadiusPercent).toBeGreaterThan(0)
      expect(experiment.blastRadiusPercent).toBeLessThanOrEqual(CHAOS_MAX_BLAST_RADIUS_PERCENT)
      expect(experiment.maxDurationMinutes).toBeGreaterThan(0)
      expect(experiment.maxDurationMinutes).toBeLessThanOrEqual(CHAOS_MAX_DURATION_MINUTES)
      expect(experiment.requiredApprovals).toContain('Security')
      expect(experiment.abortConditions.length).toBeGreaterThan(0)
      expect(experiment.dashboardPanels.length).toBeGreaterThanOrEqual(3)
    }
  })

  it('marks every built-in staging experiment as ready', () => {
    expect(listReadyChaosExperiments()).toHaveLength(stagingChaosExperiments.length)
  })

  it('reports actionable blockers for unsafe experiments', () => {
    const unsafeExperiment: ChaosExperiment = {
      ...stagingChaosExperiments[0],
      blastRadiusPercent: 50,
      maxDurationMinutes: 45,
      requiredApprovals: ['SRE'],
      abortConditions: [],
      dashboardPanels: ['Critical path P99'],
    }

    expect(evaluateChaosReadiness(unsafeExperiment)).toEqual({
      ready: false,
      blockers: [
        'Blast radius must be between 1% and 10%.',
        'Duration must be between 1 and 30 minutes.',
        'Security approval is required before staging chaos execution.',
        'At least one automated abort condition is required.',
        'At least three dashboard panels are required for operator visibility.',
      ],
    })
  })
})
