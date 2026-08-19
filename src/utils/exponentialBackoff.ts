function randIntInclusive(maxExclusive: number): number {
  return Math.floor(Math.random() * maxExclusive)
}

/**
 * Tier 2 backoff schedule:
 *   5s → 15s → 45s → 135s (×3 multiplier), capped at 300s.
 *
 * Adds full jitter (+ up to 500ms) to avoid synchronized reconnect storms.
 */
export function computeTier2ExponentialBackoffMs(
  tier2Attempts: number,
  opts?: {
    baseDelayMs?: number
    multiplier?: number
    jitterMs?: number
    maxDelayMs?: number
  },
): number {
  const baseDelayMs = opts?.baseDelayMs ?? 5_000
  const multiplier = opts?.multiplier ?? 3
  const jitterMs = opts?.jitterMs ?? 500
  const maxDelayMs = opts?.maxDelayMs ?? 300_000

  if (tier2Attempts < 1) tier2Attempts = 1

  const expDelay = baseDelayMs * Math.pow(multiplier, tier2Attempts - 1)
  const jitter = randIntInclusive(jitterMs)
  return Math.min(expDelay + jitter, maxDelayMs)
}

