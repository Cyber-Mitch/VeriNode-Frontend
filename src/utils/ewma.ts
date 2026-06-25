// Exponentially Weighted Moving Average.
//
//   e[0] = x[0]
//   e[i] = α·x[i] + (1 − α)·e[i−1]
//
// Exit-ETA projections use α = 0.3 over a sliding window of the last 32 epoch
// samples, so recent churn dominates while older epochs still damp noise.

export const DEFAULT_ALPHA = 0.3
export const DEFAULT_WINDOW = 32

/** Full EWMA series for `values` (same length as input). */
export function ewmaSeries(values: number[], alpha = DEFAULT_ALPHA): number[] {
  if (values.length === 0) return []
  const out = new Array<number>(values.length)
  out[0] = values[0]
  for (let i = 1; i < values.length; i++) {
    out[i] = alpha * values[i] + (1 - alpha) * out[i - 1]
  }
  return out
}

/**
 * Latest EWMA value over the trailing `window` samples. Returns 0 for empty
 * input.
 */
export function ewmaLatest(
  values: number[],
  alpha = DEFAULT_ALPHA,
  window = DEFAULT_WINDOW,
): number {
  if (values.length === 0) return 0
  const windowed = values.slice(-window)
  const series = ewmaSeries(windowed, alpha)
  return series[series.length - 1]
}
