// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useExitQueue } from '../useExitQueue'

// ---------------------------------------------------------------------------
// Mock epoch time utilities so tests don't depend on wall-clock time
// ---------------------------------------------------------------------------

vi.mock('@/src/utils/epochTime', () => ({
  EPOCH_MS: 384_000,
  currentEpoch: vi.fn(() => 5),
  epochStartMs: vi.fn((epoch: number) => epoch * 384_000),
  msUntilNextEpoch: vi.fn(() => 999_999_999),
  epochsToMs: vi.fn((n: number) => n * 384_000),
}))

// ---------------------------------------------------------------------------
// Mock useBeaconRPC to return controlled demo data
// ---------------------------------------------------------------------------

const mockGetValidatorQueue = vi.fn()

vi.mock('@/src/hooks/useBeaconRPC', () => ({
  useBeaconRPC: () => ({ getValidatorQueue: mockGetValidatorQueue }),
}))

// ---------------------------------------------------------------------------
// Mock zustand beacon store — controlled values updated per test
// ---------------------------------------------------------------------------

const mockIngest = vi.fn()
let mockSamplesRef: { current: unknown[] } = { current: [] }
let mockEwmaChurnRef: { current: number } = { current: 13 }

vi.mock('@/src/store/beaconSlice', () => ({
  useBeaconStore: (selector: (s: unknown) => unknown) => {
    const fakeState = {
      ingest: mockIngest,
      get samples() {
        return mockSamplesRef.current
      },
      ewmaSeries: [13],
      get ewmaChurn() {
        return mockEwmaChurnRef.current
      },
      get latest() {
        const s = mockSamplesRef.current
        return s.length ? s[s.length - 1] : null
      },
    }
    return selector(fakeState)
  },
}))

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeNetwork(overrides: Partial<{ queueDepth: number; churnLimit: number }> = {}) {
  return {
    epoch: 5,
    timestamp: 5 * 384_000,
    queueDepth: overrides.queueDepth ?? 5000,
    churnLimit: overrides.churnLimit ?? 13,
    voluntaryExits: 2,
    slashedExits: 0,
  }
}

function makeQueueReading(overrides: Partial<{ positionOffset: number; slashed: boolean }> = {}) {
  const { positionOffset = 500, slashed = false } = overrides
  return {
    network: makeNetwork(),
    position: {
      validatorIndex: 42,
      epoch: 5,
      positionOffset,
      slashed,
    },
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockSamplesRef = { current: [makeNetwork()] }
  mockEwmaChurnRef = { current: 13 }
  mockGetValidatorQueue.mockResolvedValue(makeQueueReading())
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------
// Tests
// SEED_EPOCHS is set to 40 in the hook, but currentEpoch() returns 5 in tests,
// so the seed loop only runs 5 iterations (epochs 0–5).
// ---------------------------------------------------------------------------

describe('useExitQueue', () => {
  it('starts loading and resolves projection after seed completes', async () => {
    const { result } = renderHook(() => useExitQueue(42))

    expect(result.current.isLoading).toBe(true)
    await waitFor(() => expect(result.current.isLoading).toBe(false), { timeout: 10_000 })

    expect(result.current.projection).not.toBeNull()
    expect(result.current.projection?.positionOffset).toBe(500)
    expect(result.current.projection?.churnLimit).toBe(13)
  }, 15_000)

  it('returns null projection for null validatorIndex', () => {
    const { result } = renderHook(() => useExitQueue(null))
    expect(result.current.isLoading).toBe(false)
    expect(result.current.projection).toBeNull()
    expect(mockGetValidatorQueue).not.toHaveBeenCalled()
  })

  it('isNearExit is true when positionOffset <= 10', async () => {
    mockGetValidatorQueue.mockResolvedValue(makeQueueReading({ positionOffset: 7 }))
    const { result } = renderHook(() => useExitQueue(42))

    await waitFor(() => expect(result.current.isLoading).toBe(false), { timeout: 10_000 })
    expect(result.current.isNearExit).toBe(true)
    expect(result.current.hasExited).toBe(false)
  }, 15_000)

  it('hasExited is true when positionOffset is 0', async () => {
    mockGetValidatorQueue.mockResolvedValue(makeQueueReading({ positionOffset: 0 }))
    const { result } = renderHook(() => useExitQueue(42))

    await waitFor(() => expect(result.current.isLoading).toBe(false), { timeout: 10_000 })
    expect(result.current.hasExited).toBe(true)
    expect(result.current.isNearExit).toBe(false)
  }, 15_000)

  it('isNearExit is false for position > 10', async () => {
    mockGetValidatorQueue.mockResolvedValue(makeQueueReading({ positionOffset: 100 }))
    const { result } = renderHook(() => useExitQueue(42))

    await waitFor(() => expect(result.current.isLoading).toBe(false), { timeout: 10_000 })
    expect(result.current.isNearExit).toBe(false)
  }, 15_000)

  it('computes epochsRemaining from positionOffset and ewmaChurn', async () => {
    // positionOffset=500, ewmaChurn=13 → ceil(500/13) = 39 epochs
    const { result } = renderHook(() => useExitQueue(42))

    await waitFor(() => expect(result.current.isLoading).toBe(false), { timeout: 10_000 })
    expect(result.current.projection?.epochsRemaining).toBe(39)
  }, 15_000)

  it('adds 4-epoch slashing delay when validator is slashed', async () => {
    mockGetValidatorQueue.mockResolvedValue(makeQueueReading({ positionOffset: 500, slashed: true }))
    const { result } = renderHook(() => useExitQueue(42))

    await waitFor(() => expect(result.current.isLoading).toBe(false), { timeout: 10_000 })
    // ceil(500/13) + 4 = 39 + 4 = 43
    expect(result.current.projection?.epochsRemaining).toBe(43)
    expect(result.current.projection?.slashed).toBe(true)
  }, 15_000)

  it('surfaces error string on fetch failure', async () => {
    mockGetValidatorQueue.mockRejectedValue(new Error('beacon node offline'))
    const { result } = renderHook(() => useExitQueue(42))

    await waitFor(() => expect(result.current.error).not.toBeNull(), { timeout: 10_000 })
    expect(result.current.error).toContain('beacon node offline')
  }, 15_000)

  it('notificationsEnabled starts as false', () => {
    const { result } = renderHook(() => useExitQueue(42))
    expect(result.current.notificationsEnabled).toBe(false)
  })

  it('toggleNotifications enables notifications when Notification API is granted', async () => {
    // Simulate Notification API available and already granted — no async requestPermission needed
    Object.defineProperty(window, 'Notification', {
      value: { permission: 'granted' },
      configurable: true,
      writable: true,
    })

    const { result } = renderHook(() => useExitQueue(42))

    // Wait for loading to complete before calling toggleNotifications
    await waitFor(() => expect(result.current.isLoading).toBe(false), { timeout: 10_000 })

    expect(result.current.notificationsEnabled).toBe(false)

    act(() => {
      result.current.toggleNotifications()
    })

    await waitFor(() => expect(result.current.notificationsEnabled).toBe(true), { timeout: 5_000 })
  }, 20_000)

  it('clears projection when validatorIndex changes', async () => {
    const { result, rerender } = renderHook(
      ({ idx }: { idx: number | null }) => useExitQueue(idx),
      { initialProps: { idx: 42 } },
    )

    await waitFor(() => expect(result.current.isLoading).toBe(false), { timeout: 10_000 })
    expect(result.current.projection).not.toBeNull()

    act(() => {
      rerender({ idx: 99 })
    })

    // After rerender the position should be cleared (null projection while loading).
    expect(result.current.projection).toBeNull()
  }, 15_000)

  it('ingests network snapshots into the beacon store', async () => {
    renderHook(() => useExitQueue(42))

    await waitFor(() => expect(mockIngest).toHaveBeenCalled(), { timeout: 10_000 })
    expect(mockIngest).toHaveBeenCalledWith(
      expect.objectContaining({ epoch: 5, queueDepth: 5000 }),
    )
  }, 15_000)
})
