import { create } from 'zustand'
import type { NetworkQueueSnapshot } from '@/src/types/exitQueue'
import { LRUQueueCache } from '@/src/utils/lruQueueCache'
import { interpolateQueueHistory } from '@/src/utils/queueInterpolation'
import { DEFAULT_ALPHA, DEFAULT_WINDOW, ewmaLatest, ewmaSeries } from '@/src/utils/ewma'

/**
 * Shared beacon exit-queue state. A single LRU-bounded history (≤500 entries)
 * is fed by the polling hook; on each ingest the history is gap-interpolated
 * and the per-epoch drain rate (min(depth, churn)) is EWMA-smoothed. Multiple
 * validator cards read the same derived series rather than re-deriving it.
 */
interface BeaconState {
  cache: LRUQueueCache
  /** Dense, gap-interpolated history sorted by epoch. */
  samples: NetworkQueueSnapshot[]
  /** Realized drain rate per epoch (min(queueDepth, churnLimit)). */
  churnSeries: number[]
  /** EWMA of the churn series (full length, for charting). */
  ewmaSeries: number[]
  /** Latest EWMA churn over the trailing 32-epoch window. */
  ewmaChurn: number
  latest: NetworkQueueSnapshot | null
  ingest: (snapshot: NetworkQueueSnapshot) => void
  reset: () => void
}

function deriveChurn(samples: NetworkQueueSnapshot[]): number[] {
  return samples.map((s) => Math.min(s.queueDepth, s.churnLimit))
}

export const useBeaconStore = create<BeaconState>((set, get) => ({
  cache: new LRUQueueCache(),
  samples: [],
  churnSeries: [],
  ewmaSeries: [],
  ewmaChurn: 0,
  latest: null,

  ingest: (snapshot) => {
    const { cache } = get()
    cache.set(snapshot.epoch, snapshot)

    const samples = interpolateQueueHistory(cache.values())
    const churnSeries = deriveChurn(samples)
    const latest = samples.length ? samples[samples.length - 1] : null

    set({
      samples,
      churnSeries,
      ewmaSeries: ewmaSeries(churnSeries, DEFAULT_ALPHA),
      ewmaChurn: ewmaLatest(churnSeries, DEFAULT_ALPHA, DEFAULT_WINDOW),
      latest,
    })
  },

  reset: () =>
    set({
      cache: new LRUQueueCache(),
      samples: [],
      churnSeries: [],
      ewmaSeries: [],
      ewmaChurn: 0,
      latest: null,
    }),
}))
