// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { BridgeNotificationToggle } from '@/src/components/bridge/BridgeNotificationToggle'
import { useBridgeNotifications } from '@/src/hooks/useBridgeNotifications'
import type { UseBridgeNotificationsResult } from '@/src/hooks/useBridgeNotifications'

vi.mock('@/src/hooks/useBridgeNotifications', () => ({
  useBridgeNotifications: vi.fn(),
}))

function mockResult(overrides: Partial<UseBridgeNotificationsResult>) {
  vi.mocked(useBridgeNotifications).mockReturnValue({
    supported: true,
    permission: 'default',
    enabled: false,
    requestEnable: vi.fn(),
    disable: vi.fn(),
    ...overrides,
  })
}

afterEach(() => cleanup())

describe('BridgeNotificationToggle', () => {
  it('renders nothing when the Notification API is unsupported', () => {
    mockResult({ supported: false, permission: 'unsupported' })
    const { container } = render(<BridgeNotificationToggle transactions={[]} />)
    expect(container.textContent).toBe('')
  })

  it('shows a blocked message (not a clickable prompt) once permission is denied', () => {
    mockResult({ permission: 'denied' })
    render(<BridgeNotificationToggle transactions={[]} />)
    expect(screen.getByText(/blocked/i)).toBeTruthy()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('shows an opt-in button that is not pressed by default', () => {
    mockResult({ enabled: false })
    render(<BridgeNotificationToggle transactions={[]} />)
    const button = screen.getByRole('button', { name: 'Enable notifications' })
    expect(button.getAttribute('aria-pressed')).toBe('false')
  })

  it('reflects the enabled state once the user has opted in', () => {
    mockResult({ enabled: true, permission: 'granted' })
    render(<BridgeNotificationToggle transactions={[]} />)
    const button = screen.getByRole('button', { name: 'Notifications on' })
    expect(button.getAttribute('aria-pressed')).toBe('true')
  })
})
