// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { BridgeTransactionDetail } from '@/src/components/bridge/BridgeTransactionDetail'
import { useBridgeTransactionDetail } from '@/src/hooks/useBridgeTransactionDetail'
import { makeBridgeTx } from '@/src/components/bridge/tests/fixtures'
import type { UseBridgeTransactionDetailResult } from '@/src/hooks/useBridgeTransactionDetail'

vi.mock('@/src/hooks/useBridgeTransactionDetail', () => ({
  useBridgeTransactionDetail: vi.fn(),
}))

function mockDetailResult(overrides: Partial<UseBridgeTransactionDetailResult>) {
  vi.mocked(useBridgeTransactionDetail).mockReturnValue({
    transaction: null,
    isLoading: false,
    isFetching: false,
    isError: false,
    error: null,
    refresh: vi.fn(),
    ...overrides,
  })
}

afterEach(() => cleanup())

describe('BridgeTransactionDetail', () => {
  it('shows a loading skeleton while the first fetch is in flight', () => {
    mockDetailResult({ isLoading: true })
    const { container } = render(<BridgeTransactionDetail id="tx-1" />)
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0)
  })

  it('surfaces a fetch error', () => {
    mockDetailResult({ isError: true, error: new Error('not authorized') })
    render(<BridgeTransactionDetail id="tx-1" />)
    expect(screen.getByRole('alert').textContent).toContain('not authorized')
  })

  it('renders the route, amount, and timeline for a healthy transaction, with no recovery panel', () => {
    mockDetailResult({ transaction: makeBridgeTx({ status: 'bridge_in_progress' }) })
    render(<BridgeTransactionDetail id="tx-1" />)

    expect(screen.getByText(/Ethereum.*Polygon/)).toBeTruthy()
    expect(screen.getByText(/100 USDC/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /retry|claim/i })).toBeNull()
  })

  it('shows the failure recovery panel with the type-appropriate action when the transaction has failed', () => {
    mockDetailResult({
      transaction: makeBridgeTx({
        status: 'failed_gas',
        failureReason: { type: 'gas_failure', message: 'Destination gas spiked' },
      }),
    })
    render(<BridgeTransactionDetail id="tx-1" />)

    expect(screen.getByText('Destination gas spiked')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy()
  })

  it('shows a pending destination-tx note rather than a broken link when destTxHash is not yet known', () => {
    mockDetailResult({ transaction: makeBridgeTx({ status: 'initiated', destTxHash: null }) })
    render(<BridgeTransactionDetail id="tx-1" />)

    expect(screen.getByText('Destination tx: pending')).toBeTruthy()
  })
})
