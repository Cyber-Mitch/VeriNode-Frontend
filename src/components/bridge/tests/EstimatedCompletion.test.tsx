// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { EstimatedCompletion } from '@/src/components/bridge/EstimatedCompletion'
import { makeBridgeTx } from '@/src/components/bridge/tests/fixtures'

const INITIATED = new Date('2026-07-18T00:00:00.000Z').getTime()

afterEach(() => cleanup())

describe('EstimatedCompletion', () => {
  it('renders a proportional progress bar and remaining time within the known route range', () => {
    // ethereum -> polygon route: min 180s, max 900s.
    const tx = makeBridgeTx({ sourceChain: 'ethereum', destChain: 'polygon', status: 'bridge_in_progress' })
    const now = INITIATED + 450_000 // 450s elapsed, 50% of the 900s max

    render(<EstimatedCompletion tx={tx} now={now} />)

    const bar = document.querySelector('[style*="width"]') as HTMLElement
    expect(bar.style.width).toBe('50%')
    expect(screen.getByText(/remaining/i)).toBeTruthy()
  })

  it('caps the bar at 100% and shows a "taking longer than expected" message once elapsed exceeds the max estimate', () => {
    const tx = makeBridgeTx({ sourceChain: 'ethereum', destChain: 'polygon', status: 'bridge_in_progress' })
    const now = INITIATED + 2_000_000 // far beyond the 900s max

    render(<EstimatedCompletion tx={tx} now={now} />)

    const bar = document.querySelector('[style*="width"]') as HTMLElement
    expect(bar.style.width).toBe('100%')
    expect(screen.getByText(/taking longer than expected/i)).toBeTruthy()
    expect(screen.queryByText(/remaining/i)).toBeNull()
  })

  it('shows "Unknown" rather than NaN when no historical estimate exists for the route', () => {
    const tx = makeBridgeTx({ sourceChain: 'polygon', destChain: 'base', status: 'bridge_in_progress' })

    render(<EstimatedCompletion tx={tx} now={INITIATED + 60_000} />)

    expect(screen.getByText('Unknown')).toBeTruthy()
  })

  it('shows a terminal "Complete" state without a progress bar once the transfer has finished', () => {
    const tx = makeBridgeTx({ status: 'complete' })
    render(<EstimatedCompletion tx={tx} now={INITIATED} />)

    expect(screen.getByText('Complete')).toBeTruthy()
    expect(document.querySelector('[style*="width"]')).toBeNull()
  })

  it('shows an action-needed state for failure statuses instead of a misleading progress bar', () => {
    const tx = makeBridgeTx({ status: 'failed_stuck_deposit' })
    render(<EstimatedCompletion tx={tx} now={INITIATED} />)

    expect(screen.getByText('Action needed')).toBeTruthy()
    expect(document.querySelector('[style*="width"]')).toBeNull()
  })
})
