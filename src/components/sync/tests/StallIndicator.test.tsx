// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { StallIndicator } from '@/src/components/sync/StallIndicator'

afterEach(() => cleanup())

describe('StallIndicator', () => {
  it('renders an alert role', () => {
    render(
      <StallIndicator
        stallReason="no_peers"
        stallMessage="No peers connected for 60 s"
        lastProgressAt={Date.now() - 65_000}
      />,
    )
    expect(screen.getByRole('alert')).toBeTruthy()
  })

  it('displays the stall reason label', () => {
    render(
      <StallIndicator
        stallReason="slow_peer"
        lastProgressAt={Date.now() - 70_000}
      />,
    )
    expect(screen.getByText(/Slow peer/i)).toBeTruthy()
  })

  it('displays the diagnostic message when provided', () => {
    render(
      <StallIndicator
        stallReason="processing_lag"
        stallMessage="Block processing queue is full"
        lastProgressAt={Date.now() - 80_000}
      />,
    )
    expect(screen.getByText(/Block processing queue is full/i)).toBeTruthy()
  })

  it('shows the "Restart sync" button when onRestartSync is provided', () => {
    const onRestart = vi.fn()
    render(
      <StallIndicator
        stallReason="no_peers"
        onRestartSync={onRestart}
        lastProgressAt={Date.now() - 65_000}
      />,
    )
    const btn = screen.getByRole('button', { name: /restart.*sync/i })
    expect(btn).toBeTruthy()
  })

  it('calls onRestartSync when the button is clicked', () => {
    const onRestart = vi.fn()
    render(
      <StallIndicator
        stallReason="no_peers"
        onRestartSync={onRestart}
        lastProgressAt={Date.now() - 65_000}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /restart.*sync/i }))
    expect(onRestart).toHaveBeenCalledTimes(1)
  })

  it('does NOT render a button when onRestartSync is omitted', () => {
    render(
      <StallIndicator
        stallReason="slow_peer"
        lastProgressAt={Date.now() - 65_000}
      />,
    )
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('shows "Sync stall detected" heading', () => {
    render(
      <StallIndicator
        stallReason="no_peers"
        lastProgressAt={Date.now() - 65_000}
      />,
    )
    expect(screen.getByText(/sync stall detected/i)).toBeTruthy()
  })

  it('displays elapsed stall time in seconds for short stalls', () => {
    const lastProgressAt = Date.now() - 65_000
    render(<StallIndicator stallReason="slow_peer" lastProgressAt={lastProgressAt} />)
    // Should mention something like "65 s" or similar
    expect(screen.getByText(/No block progress for/i)).toBeTruthy()
  })
})
