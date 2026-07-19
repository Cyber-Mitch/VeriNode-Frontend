// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider, focusManager } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { useBridgeTx, computeRefetchInterval } from '@/src/hooks/useBridgeTx'
import type { BridgeTransaction, BridgeTransactionListResponse } from '@/src/types/bridge'

function makeTx(overrides: Partial<BridgeTransaction> = {}): BridgeTransaction {
  return {
    id: 'tx-1',
    sourceChain: 'ethereum',
    destChain: 'polygon',
    status: 'bridge_in_progress',
    tokenSymbol: 'USDC',
    amount: '100',
    initiatedAt: '2026-07-18T00:00:00.000Z',
    completedAt: null,
    sourceTxHash: '0xabc',
    destTxHash: null,
    sourceConfirmations: 5,
    requiredSourceConfirmations: 12,
    destConfirmations: 0,
    requiredDestConfirmations: 6,
    failureReason: null,
    sourceGasUsed: '21000',
    estimatedDestGas: '150000',
    destGasUsed: null,
    usdCost: 1.5,
    ...overrides,
  }
}

function makeResponse(transactions: BridgeTransaction[], page = 1): BridgeTransactionListResponse {
  return { transactions, total: transactions.length, page, pageSize: 20 }
}

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  })
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
  return Wrapper
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

/** Advances fake timers and flushes the resulting promise chain inside act(), so React state updates land before the next assertion (avoids the classic waitFor-vs-fake-timers deadlock). */
async function flush(ms = 0) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

describe('useBridgeTx', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    focusManager.setFocused(undefined)
  })

  it('polls every 10s while a tracked transaction is non-terminal', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => makeResponse([makeTx({ status: 'bridge_in_progress' })]),
    })
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => useBridgeTx({ page: 1, pageSize: 20 }), {
      wrapper: createWrapper(),
    })

    await flush()
    expect(result.current.isLoading).toBe(false)
    expect(fetchMock).toHaveBeenCalledTimes(1)

    await flush(10_000)
    expect(fetchMock).toHaveBeenCalledTimes(2)

    await flush(10_000)
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('stops polling entirely once every tracked transaction is terminal', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => makeResponse([makeTx({ status: 'complete' })]),
    })
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => useBridgeTx({ page: 1, pageSize: 20 }), {
      wrapper: createWrapper(),
    })

    await flush()
    expect(result.current.hasActive).toBe(false)
    expect(fetchMock).toHaveBeenCalledTimes(1)

    await flush(30_000)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('clears the interval on unmount and issues no further fetches or state updates', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => makeResponse([makeTx({ status: 'bridge_in_progress' })]),
    })
    vi.stubGlobal('fetch', fetchMock)
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const { result, unmount } = renderHook(() => useBridgeTx({ page: 1, pageSize: 20 }), {
      wrapper: createWrapper(),
    })

    await flush()
    const callsBeforeUnmount = fetchMock.mock.calls.length
    expect(result.current.isLoading).toBe(false)

    unmount()
    await flush(30_000)

    expect(fetchMock).toHaveBeenCalledTimes(callsBeforeUnmount)
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it('does not start an overlapping request while the previous poll is still in flight', async () => {
    let inFlight = 0
    let maxConcurrent = 0
    const first = deferred<BridgeTransactionListResponse>()
    const fetchMock = vi.fn().mockImplementation(() => {
      inFlight += 1
      maxConcurrent = Math.max(maxConcurrent, inFlight)
      return first.promise.then((data) => {
        inFlight -= 1
        return { ok: true, json: async () => data }
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    renderHook(() => useBridgeTx({ page: 1, pageSize: 20 }), { wrapper: createWrapper() })

    await flush()
    expect(fetchMock).toHaveBeenCalledTimes(1)

    // Two poll intervals elapse while the first request is still unresolved.
    await flush(10_000)
    await flush(10_000)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(maxConcurrent).toBe(1)

    first.resolve(makeResponse([makeTx({ status: 'bridge_in_progress' })]))
    await flush()
  })

  it('discards a slow response for a stale filter/page once a newer one has resolved', async () => {
    const page1 = deferred<BridgeTransactionListResponse>()
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('page=2')) {
        return Promise.resolve({
          ok: true,
          json: async () => makeResponse([makeTx({ id: 'tx-page2', status: 'complete' })], 2),
        })
      }
      return page1.promise.then((data) => ({ ok: true, json: async () => data }))
    })
    vi.stubGlobal('fetch', fetchMock)

    const { result, rerender } = renderHook(({ page }) => useBridgeTx({ page, pageSize: 20 }), {
      wrapper: createWrapper(),
      initialProps: { page: 1 },
    })

    await flush()

    rerender({ page: 2 })
    await flush()
    expect(result.current.transactions[0]?.id).toBe('tx-page2')

    // The slow page-1 response arrives after page 2 has already rendered.
    page1.resolve(makeResponse([makeTx({ id: 'tx-page1-stale', status: 'bridge_in_progress' })], 1))
    await flush()

    expect(result.current.transactions[0]?.id).toBe('tx-page2')
  })

  it('pauses polling while the document is hidden and refetches on refocus', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => makeResponse([makeTx({ status: 'bridge_in_progress' })]),
    })
    vi.stubGlobal('fetch', fetchMock)

    renderHook(() => useBridgeTx({ page: 1, pageSize: 20 }), { wrapper: createWrapper() })
    await flush()

    focusManager.setFocused(false)
    const callsWhileVisible = fetchMock.mock.calls.length
    await flush(30_000)
    // No polling at all while hidden, however many 10s ticks elapse.
    expect(fetchMock).toHaveBeenCalledTimes(callsWhileVisible)

    focusManager.setFocused(true)
    await flush()
    // Coming back into focus produces a fresh fetch rather than waiting out the rest of the interval.
    expect(fetchMock.mock.calls.length).toBeGreaterThan(callsWhileVisible)
  })
})

describe('computeRefetchInterval', () => {
  function fakeQuery(overrides: { data?: BridgeTransactionListResponse; fetchFailureCount?: number }) {
    return {
      state: {
        data: overrides.data,
        fetchFailureCount: overrides.fetchFailureCount ?? 0,
      },
    } as Parameters<typeof computeRefetchInterval>[0]
  }

  it('backs off exponentially and caps instead of retrying every 10s after repeated failures', () => {
    expect(computeRefetchInterval(fakeQuery({ fetchFailureCount: 0 }))).toBe(10_000)
    expect(computeRefetchInterval(fakeQuery({ fetchFailureCount: 1 }))).toBe(20_000)
    expect(computeRefetchInterval(fakeQuery({ fetchFailureCount: 2 }))).toBe(40_000)
    expect(computeRefetchInterval(fakeQuery({ fetchFailureCount: 3 }))).toBe(80_000)
    expect(computeRefetchInterval(fakeQuery({ fetchFailureCount: 10 }))).toBe(80_000)
  })

  it('stops entirely once all transactions in the last successful response are terminal, regardless of failure count', () => {
    const allTerminal = makeResponse([makeTx({ status: 'complete' }), makeTx({ id: 'tx-2', status: 'failed_gas' })])
    expect(computeRefetchInterval(fakeQuery({ data: allTerminal, fetchFailureCount: 0 }))).toBe(false)
  })
})
