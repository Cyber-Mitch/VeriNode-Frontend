export type ConsensusLatencyPercentiles = {
  p50: number
  p95: number
  p99: number
}

export function calculatePercentile(sortedValues: number[], percentile: number): number {
  if (sortedValues.length === 0) return 0
  if (percentile <= 0) return sortedValues[0]
  if (percentile >= 100) return sortedValues[sortedValues.length - 1]

  const rank = (percentile / 100) * (sortedValues.length - 1)
  const lowerIndex = Math.floor(rank)
  const upperIndex = Math.ceil(rank)
  const weight = rank - lowerIndex

  if (lowerIndex === upperIndex) return sortedValues[lowerIndex]

  return sortedValues[lowerIndex] + (sortedValues[upperIndex] - sortedValues[lowerIndex]) * weight
}

export function calculateLatencyPercentiles(latenciesMs: number[]): ConsensusLatencyPercentiles {
  const sortedLatencies = [...latenciesMs].sort((a, b) => a - b)

  return {
    p50: calculatePercentile(sortedLatencies, 50),
    p95: calculatePercentile(sortedLatencies, 95),
    p99: calculatePercentile(sortedLatencies, 99),
  }
}
