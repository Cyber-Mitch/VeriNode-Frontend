import { findConsolidationRecommendations, type ConsolidationRecommendation, type ConsolidationValidator } from '@/src/utils/consolidationEligibility'

export interface ConsolidationScannerRequest {
  validators: ConsolidationValidator[]
  chunkSize?: number
  avgGasPerValidatorPerEpoch?: number
}

export interface ConsolidationScannerResponse {
  type: 'progress' | 'complete' | 'error'
  processed: number
  total: number
  recommendations?: ConsolidationRecommendation[]
  error?: string
}

const DEFAULT_CHUNK_SIZE = 500

function postMessageSafe(message: ConsolidationScannerResponse) {
  self.postMessage(message)
}

self.onmessage = (event: MessageEvent<ConsolidationScannerRequest>) => {
  const { validators, chunkSize = DEFAULT_CHUNK_SIZE, avgGasPerValidatorPerEpoch } = event.data
  const scanned: ConsolidationValidator[] = []
  let offset = 0

  const processChunk = () => {
    try {
      const chunk = validators.slice(offset, offset + chunkSize)
      scanned.push(...chunk)
      offset += chunk.length
      postMessageSafe({ type: 'progress', processed: scanned.length, total: validators.length })

      if (offset < validators.length) {
        setTimeout(processChunk, 0)
        return
      }

      postMessageSafe({
        type: 'complete',
        processed: scanned.length,
        total: validators.length,
        recommendations: findConsolidationRecommendations(scanned, avgGasPerValidatorPerEpoch),
      })
    } catch (err) {
      postMessageSafe({
        type: 'error',
        processed: scanned.length,
        total: validators.length,
        error: err instanceof Error ? err.message : 'Failed to scan validators',
      })
    }
  }

  processChunk()
}

export {}
