// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { BridgeTransactionTimeline } from '@/src/components/bridge/BridgeTransactionTimeline'
import { makeBridgeTx } from '@/src/components/bridge/tests/fixtures'

afterEach(() => cleanup())

describe('BridgeTransactionTimeline', () => {
  it('renders all five pipeline stages with their status text', () => {
    render(<BridgeTransactionTimeline tx={makeBridgeTx({ status: 'bridge_in_progress' })} />)

    for (const label of ['Initiated', 'Source Confirmed', 'Bridge In Progress', 'Destination Confirmed', 'Complete']) {
      expect(screen.getByText(label)).toBeTruthy()
    }
  })

  it('shows an explicit Pending state for destination gas and USD cost rather than 0/NaN before they are known', () => {
    render(
      <BridgeTransactionTimeline
        tx={makeBridgeTx({ status: 'bridge_in_progress', destGasUsed: null, usdCost: null })}
      />,
    )

    // "Pending" appears for the not-yet-known values; none of them render as 0, "-", or NaN.
    expect(screen.getAllByText('Pending').length).toBeGreaterThan(0)
    expect(screen.queryByText('NaN')).toBeNull()
    expect(screen.queryByText('0')).toBeNull()
  })

  it('shows real gas and cost figures once they are known', () => {
    render(
      <BridgeTransactionTimeline
        tx={makeBridgeTx({ status: 'complete', destGasUsed: '95000', usdCost: 12.34, completedAt: '2026-07-18T00:20:00.000Z' })}
      />,
    )

    expect(screen.getByText('95000')).toBeTruthy()
    expect(screen.getByText('$12.34')).toBeTruthy()
  })

  it('does not show confirmation counts for a leg that has not started yet', () => {
    const tx = makeBridgeTx({ status: 'initiated', sourceConfirmations: 0, destConfirmations: 0 })
    render(<BridgeTransactionTimeline tx={tx} />)

    // Source confirmed and dest confirmed are both still upcoming at "initiated" - no raw "0/N" reading yet.
    expect(screen.queryByText(/confirmations/)).toBeNull()
  })

  it('shows confirmation counts once a leg is actually in progress', () => {
    const tx = makeBridgeTx({ status: 'source_confirmed', sourceConfirmations: 4, requiredSourceConfirmations: 12 })
    render(<BridgeTransactionTimeline tx={tx} />)

    expect(screen.getByText('4/12 confirmations')).toBeTruthy()
  })

  it('falls back to "Unknown" for the estimated completion range when the route has no historical data', () => {
    const tx = makeBridgeTx({ sourceChain: 'polygon', destChain: 'base', status: 'bridge_in_progress' })
    render(<BridgeTransactionTimeline tx={tx} />)

    expect(screen.getByText('Unknown')).toBeTruthy()
  })
})
