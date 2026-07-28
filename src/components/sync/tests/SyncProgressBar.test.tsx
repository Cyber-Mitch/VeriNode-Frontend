// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { SyncProgressBar } from '@/src/components/sync/SyncProgressBar'
import type { SyncStatus } from '@/src/types/sync'

afterEach(() => cleanup())

function makeSyncStatus(overrides: Partial<SyncStatus> = {}): SyncStatus {
  const now = Date.now()
  return {
    currentHeight: 1_950_000,
    networkTipHeight: 2_000_000,
    bestPeerHeight: 2_000_001,
    downloadSpeedBps: 42.5,
    estimatedSecondsRemaining: 1176,
    peerCount: 25,
    peerHeights: [],
    phase: 'syncing',
    lastProgressAt: now - 2_000,
    speedHistory: [
      { timestamp: now - 10_000, blocksPerSecond: 40 },
      { timestamp: now - 5_000, blocksPerSecond: 42 },
      { timestamp: now, blocksPerSecond: 45 },
    ],
    peerCountHistory: [],
    ...overrides,
  }
}

describe('SyncProgressBar', () => {
  it('renders a progressbar role with correct aria attributes', () => {
    render(<SyncProgressBar syncStatus={makeSyncStatus()} />)
    const bar = screen.getByRole('progressbar')
    expect(bar).toBeTruthy()
    expect(bar.getAttribute('aria-valuemin')).toBe('0')
    expect(bar.getAttribute('aria-valuemax')).toBe('100')
  })

  it('shows current and network tip heights', () => {
    render(<SyncProgressBar syncStatus={makeSyncStatus()} />)
    // Heights appear as formatted numbers in the UI
    expect(screen.getByText(/1,950,000/)).toBeTruthy()
    expect(screen.getByText(/2,000,000/)).toBeTruthy()
  })

  it('shows download speed and ETA when syncing', () => {
    render(<SyncProgressBar syncStatus={makeSyncStatus()} />)
    expect(screen.getByText(/42\.5 blk\/s/)).toBeTruthy()
    // ETA is formatted — at 42.5 blk/s over 50k blocks ≈ 19 m
    expect(screen.getByText(/ETA/)).toBeTruthy()
  })

  it('shows "Fully synced" when phase is synced', () => {
    render(
      <SyncProgressBar
        syncStatus={makeSyncStatus({ phase: 'synced', downloadSpeedBps: 0, estimatedSecondsRemaining: null })}
      />,
    )
    expect(screen.getByText(/Fully synced/i)).toBeTruthy()
  })

  it('shows "Sync stalled" when phase is stalled', () => {
    render(
      <SyncProgressBar
        syncStatus={makeSyncStatus({
          phase: 'stalled',
          downloadSpeedBps: 0,
          estimatedSecondsRemaining: null,
        })}
      />,
    )
    expect(screen.getByText(/Sync stalled/i)).toBeTruthy()
  })

  it('has accessible region label', () => {
    render(<SyncProgressBar syncStatus={makeSyncStatus()} />)
    expect(
      screen.getByRole('region', { name: /node synchronization progress/i }),
    ).toBeTruthy()
  })
})
