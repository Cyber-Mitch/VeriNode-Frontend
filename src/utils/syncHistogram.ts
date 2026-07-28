import type { PeerHeightBucket } from '@/src/types/sync'

/**
 * Buckets an array of peer block-heights into a fixed number of histogram
 * bins. The local node's current height is flagged in the bucket it falls into.
 *
 * @param peerHeights  Raw block-height array reported by each peer.
 * @param currentHeight  Local node's current block height.
 * @param bucketCount  Number of histogram bars (default 10).
 */
export function buildPeerHeightHistogram(
  peerHeights: number[],
  currentHeight: number,
  bucketCount = 10,
): PeerHeightBucket[] {
  if (peerHeights.length === 0) return []

  const min = Math.min(...peerHeights, currentHeight)
  const max = Math.max(...peerHeights, currentHeight)

  // Avoid zero-width range when all heights are identical.
  const range = max - min || 1
  const bucketWidth = Math.ceil(range / bucketCount)

  const buckets: PeerHeightBucket[] = Array.from({ length: bucketCount }, (_, i) => {
    const from = min + i * bucketWidth
    const to = from + bucketWidth
    return {
      label: `${from.toLocaleString()}`,
      from,
      to,
      count: 0,
      isLocalNode: false,
    }
  })

  // Tally each peer height into the appropriate bucket.
  for (const h of peerHeights) {
    const idx = Math.min(Math.floor((h - min) / bucketWidth), bucketCount - 1)
    buckets[idx].count += 1
  }

  // Mark the bucket that contains the local node.
  const localIdx = Math.min(
    Math.floor((currentHeight - min) / bucketWidth),
    bucketCount - 1,
  )
  buckets[localIdx].isLocalNode = true

  return buckets
}

/**
 * Formats a seconds-remaining value into a human-readable string.
 * Examples: "2 h 14 m", "45 m", "< 1 m"
 */
export function formatTimeRemaining(seconds: number): string {
  if (seconds < 60) return '< 1 m'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h > 0) return `${h} h ${m} m`
  return `${m} m`
}

/**
 * Returns a short trend arrow character based on the trailing speed series.
 * Compares the last third of the series against the first third.
 */
export function speedTrendArrow(speedHistory: { blocksPerSecond: number }[]): '↑' | '↓' | '→' {
  if (speedHistory.length < 3) return '→'
  const n = speedHistory.length
  const third = Math.max(1, Math.floor(n / 3))
  const early = speedHistory.slice(0, third).reduce((s, p) => s + p.blocksPerSecond, 0) / third
  const late = speedHistory.slice(n - third).reduce((s, p) => s + p.blocksPerSecond, 0) / third
  const delta = late - early
  if (delta > early * 0.05) return '↑'
  if (delta < -early * 0.05) return '↓'
  return '→'
}
