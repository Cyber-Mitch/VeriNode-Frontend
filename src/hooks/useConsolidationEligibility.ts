'use client'

import { useEffect, useMemo, useState } from 'react'
import type { ValidatorReconciliation } from '@/src/hooks/useValidatorBalances'
import type { ConsolidationRecommendation, ConsolidationValidator } from '@/src/utils/consolidationEligibility'
import type { ConsolidationScannerResponse } from '@/src/workers/consolidationScannerWorker'
import { gweiToEth } from '@/src/utils/ethMath'

interface UseConsolidationEligibilityOptions {
  avgGasPerValidatorPerEpoch?: number
}

function fallbackWithdrawalCredentials(validatorIndex: number): string {
  return `0xdemo${String(Math.floor(validatorIndex / 64)).padStart(60, '0')}`
}

export function useConsolidationEligibility(
  validatorIndices: number[],
  byValidator: Record<number, ValidatorReconciliation>,
  options: UseConsolidationEligibilityOptions = {},
) {
  const [recommendations, setRecommendations] = useState<ConsolidationRecommendation[]>([])
  const [processed, setProcessed] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const scanKey = validatorIndices.join(',')

  const validators = useMemo<ConsolidationValidator[]>(() => validatorIndices.map((validatorIndex) => {
    const latest = byValidator[validatorIndex]?.summary.latest
    return {
      validatorIndex,
      effectiveBalanceEth: latest ? gweiToEth(latest.effectiveBalanceGwei) : 32,
      activationEpoch: Math.max(0, (latest?.epoch ?? 0) - (byValidator[validatorIndex]?.summary.recordCount ?? 0)),
      withdrawalCredentials: fallbackWithdrawalCredentials(validatorIndex),
    }
  }), [validatorIndices, byValidator])

  const [trackedScanKey, setTrackedScanKey] = useState<string | undefined>(undefined)
  if (trackedScanKey !== scanKey) {
    setTrackedScanKey(scanKey)
    setIsLoading(validators.length > 0)
    setError(null)
    setProcessed(0)
    setRecommendations([])
  }

  useEffect(() => {
    if (validators.length === 0) return
    const worker = new Worker(new URL('../workers/consolidationScannerWorker.ts', import.meta.url))

    worker.onmessage = (event: MessageEvent<ConsolidationScannerResponse>) => {
      const message = event.data
      setProcessed(message.processed)
      if (message.type === 'complete') {
        setRecommendations(message.recommendations ?? [])
        setIsLoading(false)
        worker.terminate()
      } else if (message.type === 'error') {
        setError(message.error ?? 'Failed to scan validators')
        setIsLoading(false)
        worker.terminate()
      }
    }

    worker.onerror = () => {
      setError('Consolidation scanner worker failed')
      setIsLoading(false)
      worker.terminate()
    }

    worker.postMessage({ validators, avgGasPerValidatorPerEpoch: options.avgGasPerValidatorPerEpoch })
    return () => worker.terminate()
  }, [validators, options.avgGasPerValidatorPerEpoch])

  return { recommendations, processed, total: validators.length, isLoading, error }
}
