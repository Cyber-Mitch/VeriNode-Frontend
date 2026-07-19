// DBSCAN density-based clustering algorithm for geo-coordinates.
//
// Parameters:
//   ε  = 500 km  (maximum neighbourhood radius)
//   minPts = 3   (minimum cluster member count)
//
// Distance is computed via the Haversine formula on WGS-84 lat/lng pairs.
// Noise points (not reachable from any core point) are assigned cluster -1.
// This runs synchronously; for large node sets post to riskClusterWorker.

export const DBSCAN_EPSILON_KM = 500
export const DBSCAN_MIN_PTS = 3

const EARTH_RADIUS_KM = 6_371

/** Haversine great-circle distance in kilometres between two lat/lng points. */
export function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2
  return EARTH_RADIUS_KM * 2 * Math.asin(Math.sqrt(a))
}

export interface GeoPoint {
  /** Index into the original input array. */
  index: number
  lat: number
  lng: number
}

/**
 * Run DBSCAN on an array of geo-points.
 *
 * Returns an array of cluster IDs parallel to the input: -1 = noise,
 * 0..N-1 = cluster index.
 */
export function dbscan(
  points: GeoPoint[],
  epsilonKm: number = DBSCAN_EPSILON_KM,
  minPts: number = DBSCAN_MIN_PTS,
): number[] {
  const n = points.length
  const labels = new Array<number>(n).fill(-2) // -2 = unvisited
  let clusterCount = 0

  /** Return indices of all points within ε of point i. */
  function regionQuery(i: number): number[] {
    const neighbours: number[] = []
    const { lat, lng } = points[i]
    for (let j = 0; j < n; j++) {
      if (haversineKm(lat, lng, points[j].lat, points[j].lng) <= epsilonKm) {
        neighbours.push(j)
      }
    }
    return neighbours
  }

  for (let i = 0; i < n; i++) {
    if (labels[i] !== -2) continue // already visited
    const neighbours = regionQuery(i)
    if (neighbours.length < minPts) {
      labels[i] = -1 // noise (may be absorbed later)
      continue
    }

    const clusterId = clusterCount++
    labels[i] = clusterId

    // Expand cluster: seed queue with all current neighbours.
    const queue = [...neighbours]
    const queued = new Set<number>(neighbours)
    let qi = 0

    while (qi < queue.length) {
      const q = queue[qi++]
      if (labels[q] === -1) labels[q] = clusterId // absorb border noise
      if (labels[q] !== -2) continue // already labelled
      labels[q] = clusterId

      const qNeighbours = regionQuery(q)
      if (qNeighbours.length >= minPts) {
        for (const nb of qNeighbours) {
          if (!queued.has(nb)) {
            queued.add(nb)
            queue.push(nb)
          }
        }
      }
    }
  }

  return labels
}
