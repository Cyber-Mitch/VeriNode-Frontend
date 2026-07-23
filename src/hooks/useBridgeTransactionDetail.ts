'use client'

import { useQuery, type Query } from '@tanstack/react-query'
import { fetchBridgeTransaction } from '@/src/lib/api/bridge'
import { isTerminalBridgeStatus, type BridgeTransaction } from '@/src/types/bridge'

const POLL_INTERVAL_MS = 10_000
const MAX_POLL_INTERVAL_MS = 80_000

/** Single-transaction mirror of useBridgeTx's computeRefetchInterval: stop once terminal, back off on repeated failure. */
export function computeDetailRefetchInterval(query: Query<BridgeTransaction, Error>): number | false {
  const data = query.state.data
  if (data && isTerminalBridgeStatus(data.status)) {
    return false
  }

  const failures = query.state.fetchFailureCount
  if (failures > 0) {
    return Math.min(POLL_INTERVAL_MS * 2 ** failures, MAX_POLL_INTERVAL_MS)
  }

  return POLL_INTERVAL_MS
}

export interface UseBridgeTransactionDetailResult {
  transaction: BridgeTransaction | null
  isLoading: boolean
  isFetching: boolean
  isError: boolean
  error: Error | null
  refresh: () => void
}

/** Fetches /api/v1/bridge/transactions/:id and polls every 10s while the transaction is non-terminal, same lifecycle rules as useBridgeTx. */
export function useBridgeTransactionDetail(id: string): UseBridgeTransactionDetailResult {
  const query = useQuery<BridgeTransaction, Error>({
    queryKey: ['bridge-transaction', id],
    queryFn: ({ signal }) => fetchBridgeTransaction(id, signal),
    enabled: Boolean(id),
    refetchInterval: computeDetailRefetchInterval,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: 'always',
    retry: 3,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10_000),
  })

  return {
    transaction: query.data ?? null,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    error: query.error,
    refresh: () => {
      void query.refetch()
    },
  }
}
