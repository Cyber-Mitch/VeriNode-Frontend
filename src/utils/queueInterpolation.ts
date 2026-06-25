// Gap interpolation for exit-queue history.
//
// Epoch polls can be missed (RPC hiccups, tab backgrounding). Rather than
// leave holes that distort the EWMA, we linearly interpolate the queue depth
// and churn limit across missing epochs between two observed samples. Synthetic
// entries are flagged `interpolated` and carry zero new-exit counts.

import type { NetworkQueueSnapshot } from '@/src/types/exitQueue'
import { epochStartMs } from '@/src/utils/epochTime'

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

/**
 * Return a dense, epoch-contiguous history from possibly-sparse samples.
 * Input need not be sorted; duplicate epochs keep the last observation.
 */
export function interpolateQueueHistory(samples: NetworkQueueSnapshot[]): NetworkQueueSnapshot[] {
  if (samples.length === 0) return []

  const sorted = [...samples].sort((a, b) => a.epoch - b.epoch)
  const deduped: NetworkQueueSnapshot[] = []
  for (const s of sorted) {
    const last = deduped[deduped.length - 1]
    if (last && last.epoch === s.epoch) deduped[deduped.length - 1] = s
    else deduped.push(s)
  }

  const dense: NetworkQueueSnapshot[] = []
  for (let i = 0; i < deduped.length; i++) {
    const current = deduped[i]
    dense.push(current)

    const next = deduped[i + 1]
    if (!next) break
    const gap = next.epoch - current.epoch
    if (gap <= 1) continue

    for (let epoch = current.epoch + 1; epoch < next.epoch; epoch++) {
      const t = (epoch - current.epoch) / gap
      dense.push({
        epoch,
        timestamp: epochStartMs(epoch),
        queueDepth: Math.round(lerp(current.queueDepth, next.queueDepth, t)),
        churnLimit: Math.round(lerp(current.churnLimit, next.churnLimit, t)),
        voluntaryExits: 0,
        slashedExits: 0,
        interpolated: true,
      })
    }
  }

  return dense
}
