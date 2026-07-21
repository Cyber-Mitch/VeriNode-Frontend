import type { BridgeChain, BridgeTransaction, BridgeTransactionListResponse, BridgeTxStatus } from '@/src/types/bridge'

// /api/v1/bridge/transactions does not exist yet on the backend. This module
// is the sole seam that talks to it - assumptions about the request/response
// shape are documented on the #95 PR and are safe to change here without
// touching callers (useBridgeTx, BridgeTransactionList).
const BASE = '/api/v1/bridge'

export interface FetchBridgeTransactionsParams {
  chain?: BridgeChain
  status?: BridgeTxStatus
  /** ISO date (yyyy-mm-dd), inclusive. Filters on initiatedAt. */
  dateFrom?: string
  dateTo?: string
  page: number
  pageSize: number
  signal?: AbortSignal
}

async function parseErrorMessage(res: Response, fallback: string): Promise<string> {
  const body = await res.json().catch(() => ({ message: fallback }))
  return (body as { message?: string }).message ?? fallback
}

export async function fetchBridgeTransactions({
  chain,
  status,
  dateFrom,
  dateTo,
  page,
  pageSize,
  signal,
}: FetchBridgeTransactionsParams): Promise<BridgeTransactionListResponse> {
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) })
  if (chain) params.set('chain', chain)
  if (status) params.set('status', status)
  if (dateFrom) params.set('dateFrom', dateFrom)
  if (dateTo) params.set('dateTo', dateTo)

  const res = await fetch(`${BASE}/transactions?${params.toString()}`, {
    headers: { Accept: 'application/json' },
    credentials: 'include',
    signal,
  })

  if (!res.ok) {
    throw new Error(await parseErrorMessage(res, `Failed to load bridge transactions: ${res.status}`))
  }

  return res.json()
}

export async function fetchBridgeTransaction(id: string, signal?: AbortSignal): Promise<BridgeTransaction> {
  const res = await fetch(`${BASE}/transactions/${id}`, {
    headers: { Accept: 'application/json' },
    credentials: 'include',
    signal,
  })

  if (!res.ok) {
    throw new Error(await parseErrorMessage(res, `Failed to load bridge transaction: ${res.status}`))
  }

  return res.json()
}

export async function retryBridgeTransaction(id: string): Promise<void> {
  const res = await fetch(`${BASE}/transactions/${id}/retry`, {
    method: 'POST',
    headers: { Accept: 'application/json' },
    credentials: 'include',
  })

  if (!res.ok) {
    throw new Error(await parseErrorMessage(res, `Retry failed: ${res.status}`))
  }
}

export async function claimStuckDeposit(id: string): Promise<void> {
  const res = await fetch(`${BASE}/transactions/${id}/claim`, {
    method: 'POST',
    headers: { Accept: 'application/json' },
    credentials: 'include',
  })

  if (!res.ok) {
    throw new Error(await parseErrorMessage(res, `Claim failed: ${res.status}`))
  }
}
