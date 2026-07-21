// Web worker for attestation inclusion-delay binning.
//
// Binning a range of up to 2,048 epochs of inclusion data is offloaded here so
// the main thread stays free for canvas rendering and interaction at 60 FPS.
// Delay values arrive as a transferable Float64Array; the worker returns the
// fully-computed histogram (counts, percentages, cumulative, scaling hints).

import { binDelays, type HistogramWorkerRequest, type HistogramWorkerResponse } from '@/src/utils/histogramBinner'

function post(message: HistogramWorkerResponse): void {
  ;(self as unknown as Worker).postMessage(message)
}

self.onmessage = (e: MessageEvent<HistogramWorkerRequest>) => {
  const msg = e.data
  if (msg.type !== 'COMPUTE') return

  const { requestId, delays } = msg.payload
  try {
    const histogram = binDelays(delays)
    post({ type: 'RESULT', payload: { requestId, histogram } })
  } catch (err) {
    post({
      type: 'ERROR',
      payload: { requestId, message: err instanceof Error ? err.message : 'Unknown worker error' },
    })
  }
}
