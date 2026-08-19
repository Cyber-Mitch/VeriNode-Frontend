// Composite node-health score for the operator dashboard.
//
// The score is a weighted blend of four inputs, per the dashboard spec:
//   - attestation effectiveness  40%
//   - proposal timeliness        30%
//   - uptime                     20%
//   - peer count                 10%
//
// The first three inputs are already percentages (0..100). Peer count is a raw
// count, normalized against a healthy target so it contributes on the same
// 0..100 scale.

import type { HealthGrade, HealthScore } from '@/src/types/operator';

export const HEALTH_WEIGHTS = {
  attestationEffectiveness: 0.4,
  proposalTimeliness: 0.3,
  uptime: 0.2,
  peerCount: 0.1,
} as const;

/**
 * Peer count considered fully healthy. At or above this, the peer-count input
 * scores 100; below it, it scales down linearly.
 */
export const HEALTHY_PEER_TARGET = 50;

/** Clamp a number to the inclusive [min, max] range. */
export function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, value));
}

/** Normalize a raw peer count to a 0..100 health input. */
export function normalizePeerCount(peerCount: number, target = HEALTHY_PEER_TARGET): number {
  if (target <= 0) return 100;
  return clamp((peerCount / target) * 100, 0, 100);
}

/** Map a 0..100 score to a coarse grade. */
export function gradeFor(score: number): HealthGrade {
  if (score >= 90) return 'excellent';
  if (score >= 75) return 'good';
  if (score >= 50) return 'fair';
  return 'poor';
}

export interface HealthInputs {
  attestationEffectivenessPct: number;
  proposalTimelinessPct: number;
  uptimePct: number;
  peerCount: number;
  /** Optional override for the healthy peer target (mainly for tests). */
  peerTarget?: number;
}

/**
 * Compute the composite health score (0..100) and its weighted components.
 * All percentage inputs are clamped to [0, 100]; peer count is normalized.
 */
export function computeHealthScore(inputs: HealthInputs): HealthScore {
  const attestation = clamp(inputs.attestationEffectivenessPct, 0, 100);
  const proposal = clamp(inputs.proposalTimelinessPct, 0, 100);
  const uptime = clamp(inputs.uptimePct, 0, 100);
  const peers = normalizePeerCount(inputs.peerCount, inputs.peerTarget);

  const components = {
    attestationEffectiveness: attestation * HEALTH_WEIGHTS.attestationEffectiveness,
    proposalTimeliness: proposal * HEALTH_WEIGHTS.proposalTimeliness,
    uptime: uptime * HEALTH_WEIGHTS.uptime,
    peerCount: peers * HEALTH_WEIGHTS.peerCount,
  };

  const score =
    components.attestationEffectiveness +
    components.proposalTimeliness +
    components.uptime +
    components.peerCount;

  // Round to avoid floating-point noise; score stays within [0, 100] because
  // each component is a clamped input times a weight, and weights sum to 1.
  const rounded = Math.round(score * 10) / 10;

  return {
    score: rounded,
    grade: gradeFor(rounded),
    components,
  };
}
