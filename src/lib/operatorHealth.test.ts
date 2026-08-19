import { describe, expect, it } from 'vitest';
import {
  clamp,
  computeHealthScore,
  gradeFor,
  HEALTHY_PEER_TARGET,
  normalizePeerCount,
} from './operatorHealth';

describe('operatorHealth', () => {
  it('scores a perfect validator at 100 / excellent', () => {
    const h = computeHealthScore({
      attestationEffectivenessPct: 100,
      proposalTimelinessPct: 100,
      uptimePct: 100,
      peerCount: HEALTHY_PEER_TARGET,
    });
    expect(h.score).toBe(100);
    expect(h.grade).toBe('excellent');
  });

  it('applies the 40/30/20/10 weights', () => {
    // Only attestation effectiveness at 100, everything else 0 -> 40.
    const h = computeHealthScore({
      attestationEffectivenessPct: 100,
      proposalTimelinessPct: 0,
      uptimePct: 0,
      peerCount: 0,
    });
    expect(h.score).toBe(40);
    expect(h.components.attestationEffectiveness).toBe(40);
  });

  it('normalizes peer count against the target and caps at 100', () => {
    expect(normalizePeerCount(0)).toBe(0);
    expect(normalizePeerCount(HEALTHY_PEER_TARGET)).toBe(100);
    expect(normalizePeerCount(HEALTHY_PEER_TARGET * 2)).toBe(100); // capped
    expect(normalizePeerCount(25, 50)).toBe(50);
  });

  it('clamps out-of-range inputs instead of over/under-scoring', () => {
    const h = computeHealthScore({
      attestationEffectivenessPct: 250,
      proposalTimelinessPct: -50,
      uptimePct: 100,
      peerCount: 9999,
    });
    // attestation clamps to 100 (40), proposal clamps to 0 (0), uptime 100 (20),
    // peers cap to 100 (10) => 70.
    expect(h.score).toBe(70);
  });

  it('grades the boundaries', () => {
    expect(gradeFor(90)).toBe('excellent');
    expect(gradeFor(75)).toBe('good');
    expect(gradeFor(50)).toBe('fair');
    expect(gradeFor(49.9)).toBe('poor');
  });

  it('clamp handles NaN by returning the min', () => {
    expect(clamp(Number.NaN, 0, 100)).toBe(0);
  });
});
