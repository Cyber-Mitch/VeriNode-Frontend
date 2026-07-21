// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import { BridgeFailureRecovery } from '@/src/components/bridge/BridgeFailureRecovery'
import { claimStuckDeposit, retryBridgeTransaction } from '@/src/lib/api/bridge'

vi.mock('@/src/lib/api/bridge', () => ({
  retryBridgeTransaction: vi.fn(),
  claimStuckDeposit: vi.fn(),
}))

afterEach(() => {
  cleanup()
  vi.mocked(retryBridgeTransaction).mockReset()
  vi.mocked(claimStuckDeposit).mockReset()
})

describe('BridgeFailureRecovery', () => {
  it('shows a Retry button and calls retryBridgeTransaction for a gas failure', async () => {
    vi.mocked(retryBridgeTransaction).mockResolvedValue(undefined)
    render(
      <BridgeFailureRecovery
        transactionId="tx-1"
        failureReason={{ type: 'gas_failure', message: 'Gas spiked' }}
      />,
    )

    expect(screen.getByText('Gas spiked')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /claim/i })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))

    await waitFor(() => expect(retryBridgeTransaction).toHaveBeenCalledWith('tx-1'))
    expect(claimStuckDeposit).not.toHaveBeenCalled()
  })

  it('shows a Claim button and calls claimStuckDeposit for a stuck deposit', async () => {
    vi.mocked(claimStuckDeposit).mockResolvedValue(undefined)
    render(
      <BridgeFailureRecovery
        transactionId="tx-2"
        failureReason={{ type: 'stuck_deposit', message: 'Funds stuck in bridge contract' }}
      />,
    )

    expect(screen.queryByRole('button', { name: /retry/i })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Claim' }))

    await waitFor(() => expect(claimStuckDeposit).toHaveBeenCalledWith('tx-2'))
    expect(retryBridgeTransaction).not.toHaveBeenCalled()
  })

  it('shows the reason with no action button for an unrecognized failure type', () => {
    render(<BridgeFailureRecovery transactionId="tx-3" failureReason={{ type: 'unknown', message: 'Cause unclear' }} />)

    expect(screen.getByText('Cause unclear')).toBeTruthy()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('disables the button while the request is in flight and ignores a rapid second click (no double submit)', async () => {
    let resolveRetry!: () => void
    vi.mocked(retryBridgeTransaction).mockReturnValue(
      new Promise<void>((resolve) => {
        resolveRetry = resolve
      }),
    )

    render(<BridgeFailureRecovery transactionId="tx-1" failureReason={{ type: 'gas_failure', message: 'Gas spiked' }} />)

    const button = screen.getByRole('button', { name: 'Retry' })
    fireEvent.click(button)
    // Fire a second click before the promise resolves and before React has necessarily re-rendered `disabled`.
    fireEvent.click(button)

    expect(retryBridgeTransaction).toHaveBeenCalledTimes(1)
    expect((screen.getByRole('button', { name: 'Retrying…' }) as HTMLButtonElement).disabled).toBe(true)

    resolveRetry()
    await waitFor(() => expect(screen.getByRole('status')).toBeTruthy())
  })

  it('surfaces the action error rather than silently no-op-ing on failure', async () => {
    vi.mocked(retryBridgeTransaction).mockRejectedValue(new Error('Retry rejected: nonce too low'))

    render(<BridgeFailureRecovery transactionId="tx-1" failureReason={{ type: 'gas_failure', message: 'Gas spiked' }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))

    await waitFor(() => {
      const alerts = screen.getAllByRole('alert')
      expect(alerts.some((el) => el.textContent?.includes('Retry rejected: nonce too low'))).toBe(true)
    })
    // Button re-enables so the user can try again.
    expect((screen.getByRole('button', { name: 'Retry' }) as HTMLButtonElement).disabled).toBe(false)
  })
})
