// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { BridgeStatusStepper } from '@/src/components/bridge/BridgeStatusStepper'

afterEach(() => cleanup())

describe('BridgeStatusStepper', () => {
  it('exposes an accessible summary that names the current stage, not just color', () => {
    render(<BridgeStatusStepper status="bridge_in_progress" />)

    const list = screen.getByRole('list', { name: /bridge in progress/i })
    expect(list).toBeTruthy()
    expect(list.getAttribute('aria-label')).toMatch(/stage 3 of 5/i)
  })

  it('gives every stage dot a non-color text cue (title) and marks the current one aria-current', () => {
    render(<BridgeStatusStepper status="source_confirmed" />)

    expect(screen.getByTitle('Initiated - done')).toBeTruthy()
    expect(screen.getByTitle('Source Confirmed - in progress')).toBeTruthy()
    expect(screen.getByTitle('Bridge In Progress - pending')).toBeTruthy()

    const current = screen.getByTitle('Source Confirmed - in progress')
    expect(current.getAttribute('aria-current')).toBe('step')
  })

  it('surfaces the failure reason in the accessible summary and marks the failed stage, not a color swatch', () => {
    render(
      <BridgeStatusStepper
        status="failed_gas"
        failureReason={{ type: 'gas_failure', message: 'Destination gas price spiked mid-transfer' }}
      />,
    )

    const list = screen.getByRole('list', { name: /Destination gas price spiked mid-transfer/i })
    expect(list).toBeTruthy()
    expect(screen.getByTitle('Bridge In Progress - failed')).toBeTruthy()
    // Stages after the failure point are neither "done" nor "failed" - they were never reached.
    expect(screen.getByTitle('Destination Confirmed - pending')).toBeTruthy()
  })
})
