'use client'

import { useQuery, type Query } from '@tanstack/react-query'
import { fetchBridgeTransactions } from '@/src/lib/api/bridge'
import { isTerminalBridgeStatus, type BridgeChain, type BridgeTransactionListResponse, type BridgeTxStatus } from '@/src/types/bridge'

const POLL_INTERVAL_MS = 10_000
const MAX_POLL_INTERVAL_MS = 80_000

/**
 * Backs off exponentially (10s, 20s, 40s, 80s cap) on consecutive poll
 * failures instead of hammering every 10s, and stops polling entirely once
 * every transaction in the current page/filter is terminal.
 */
export function computeRefetchInterval(query: Query<BridgeTransactionListResponse, Error>): number | false {
  const data = query.state.data
  if (data && !data.transactions.some((tx) => !isTerminalBridgeStatus(tx.status))) {
    return false
  }

  const failures = query.state.fetchFailureCount
  if (failures > 0) {
    return Math.min(POLL_INTERVAL_MS * 2 ** failures, MAX_POLL_INTERVAL_MS)
  }

  return POLL_INTERVAL_MS
}

export interface UseBridgeTxParams {
  chain?: BridgeChain
  status?: BridgeTxStatus
  dateFrom?: string
  dateTo?: string
  page: number
  pageSize: number
}

export interface UseBridgeTxResult {
  transactions: BridgeTransactionListResponse['transactions']
  total: number
  isLoading: boolean
  isFetching: boolean
  isError: boolean
  error: Error | null
  refresh: () => void
  hasActive: boolean
}

/**
 * Fetches /api/v1/bridge/transactions and polls every 10s, but only while at
 * least one transaction on the current page/filter is non-terminal. Filter
 * and page changes produce a distinct query key, so a slow response for a
 * previous filter/page can never overwrite the current view (React Query
 * keys and aborts by query key). Polling automatically pauses while the tab
 * is hidden and does a fresh fetch on refocus (see refetchIntervalInBackground
 * / refetchOnWindowFocus below).
 */
export function useBridgeTx({ chain, status, dateFrom, dateTo, page, pageSize }: UseBridgeTxParams): UseBridgeTxResult {
  const query = useQuery<BridgeTransactionListResponse, Error>({
    queryKey: ['bridge-transactions', chain, status, dateFrom, dateTo, page, pageSize],
    queryFn: ({ signal }) => fetchBridgeTransactions({ chain, status, dateFrom, dateTo, page, pageSize, signal }),
    refetchInterval: computeRefetchInterval,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: 'always',
    retry: 3,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10_000),
  })

  const transactions = query.data?.transactions ?? []
  const hasActive = transactions.some((tx) => !isTerminalBridgeStatus(tx.status))

  return {
    transactions,
    total: query.data?.total ?? 0,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    error: query.error,
    refresh: () => {
      void query.refetch()
    },
    hasActive,
  }
}
