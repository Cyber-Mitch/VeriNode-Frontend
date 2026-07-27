// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useSyncStatus } from '@/src/hooks/useSyncStatus'

// ---------------------------------------------------------------------------
// Mock the REST API module so tests never hit the network
// ---------------------------------------------------------------------------

vi.mock('@/src/lib/api/syncStatus', () => ({
  fetchSyncStatus: vi.fn(),
}))

import { fetchSyncStatus } from '@/src/lib/api/syncStatus'
const mockFetch = fetchSyncStatus as ReturnType<typeof vi.fn>

// Minimal SyncStatus fixture
function makeSyncStatus(overrides = {}) {
  const now = Date.now()
  return {
    currentHeight: 1_950_000,
    networkTipHeight: 2_000_000,
    bestPeerHeight: 2_000_001,
    downloadSpeedBps: 42.5,
    estimatedSecondsRemaining: 1176,
    peerCount: 25,
    peerHeights: [1_999_500, 2_000_000, 2_000_001],
    phase: 'syncing' as const,
    lastProgressAt: now - 2_000,
    speedHistory: [
      { timestamp: now - 20_000, blocksPerSecond: 40 },
      { timestamp: now - 10_000, blocksPerSecond: 42.5 },
    ],
    peerCountHistory: [
      { timestamp: now - 20_000, peerCount: 24 },
      { timestamp: now - 10_000, peerCount: 25 },
    ],
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useSyncStatus', () => {
  it('starts in loading state and resolves with REST data', async () => {
    mockFetch.mockResolvedValueOnce(makeSyncStatus())

    const { result } = renderHook(() => useSyncStatus())

    expect(result.current.isLoading).toBe(true)
    expect(result.current.syncStatus).toBeNull()

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.syncStatus).not.toBeNull()
    expect(result.current.syncStatus?.currentHeight).toBe(1_950_000)
    expect(result.current.syncStatus?.phase).toBe('syncing')
  })

  it('falls back to demo data when the REST fetch rejects', async () => {
    mockFetch.mockRejectedValueOnce(new Error('API unreachable'))

    const { result } = renderHook(() => useSyncStatus())

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    // Demo data is always non-null and has the required fields
    expect(result.current.syncStatus).not.toBeNull()
    expect(result.current.error).toBeNull()
    expect(typeof result.current.syncStatus?.currentHeight).toBe('number')
  })

  it('returns simulateStall demo data when simulateStall=true', async () => {
    mockFetch.mockRejectedValueOnce(new Error('API unreachable'))

    const { result } = renderHook(() => useSyncStatus({ simulateStall: true }))

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.syncStatus?.phase).toBe('stalled')
    expect(result.current.syncStatus?.stallReason).toBeDefined()
  })

  it('exposes wsConnected as false initially (no wsUrl)', async () => {
    mockFetch.mockResolvedValueOnce(makeSyncStatus())

    const { result } = renderHook(() => useSyncStatus())

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.wsConnected).toBe(false)
  })

  it('refresh() re-invokes the REST fetch', async () => {
    mockFetch.mockResolvedValue(makeSyncStatus())

    const { result } = renderHook(() => useSyncStatus())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(mockFetch).toHaveBeenCalledTimes(1)

    result.current.refresh()

    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2))
  })

  it('stalled syncStatus has stallReason and stallMessage populated', async () => {
    mockFetch.mockResolvedValueOnce(
      makeSyncStatus({
        phase: 'stalled',
        stallReason: 'no_peers',
        stallMessage: 'No peers detected for 60 s',
        downloadSpeedBps: 0,
        estimatedSecondsRemaining: null,
      }),
    )

    const { result } = renderHook(() => useSyncStatus())

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.syncStatus?.phase).toBe('stalled')
    expect(result.current.syncStatus?.stallReason).toBe('no_peers')
    expect(result.current.syncStatus?.stallMessage).toContain('No peers')
  })
})
