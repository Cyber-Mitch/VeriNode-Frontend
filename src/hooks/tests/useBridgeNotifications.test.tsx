// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useBridgeNotifications, __resetBridgeNotificationState } from '@/src/hooks/useBridgeNotifications'
import { makeBridgeTx } from '@/src/components/bridge/tests/fixtures'
import type { BridgeTransaction } from '@/src/types/bridge'

class MockNotification {
  static permission: NotificationPermission = 'granted'
  static requestPermission = vi.fn(async () => MockNotification.permission)
  static instances: MockNotification[] = []
  body?: string
  constructor(
    public title: string,
    options?: NotificationOptions,
  ) {
    this.body = options?.body
    MockNotification.instances.push(this)
  }
}

async function enable(result: { current: ReturnType<typeof useBridgeNotifications> }) {
  await act(async () => {
    result.current.requestEnable()
  })
}

describe('useBridgeNotifications', () => {
  let originalNotification: unknown

  beforeEach(() => {
    __resetBridgeNotificationState()
    originalNotification = (window as unknown as { Notification?: unknown }).Notification
    MockNotification.permission = 'granted'
    MockNotification.instances = []
    MockNotification.requestPermission.mockClear()
    ;(window as unknown as { Notification: unknown }).Notification = MockNotification
  })

  afterEach(() => {
    ;(window as unknown as { Notification: unknown }).Notification = originalNotification
  })

  it('fires exactly once when a transaction transitions into complete', async () => {
    const { result, rerender } = renderHook(({ txs }: { txs: BridgeTransaction[] }) => useBridgeNotifications(txs), {
      initialProps: { txs: [makeBridgeTx({ id: 'tx-1', status: 'bridge_in_progress' })] },
    })
    await enable(result)

    rerender({ txs: [makeBridgeTx({ id: 'tx-1', status: 'complete' })] })

    expect(MockNotification.instances).toHaveLength(1)
    expect(MockNotification.instances[0].body).toContain('Ethereum to Polygon is complete!')
  })

  it('does not fire on a poll tick where the status is unchanged', async () => {
    const { result, rerender } = renderHook(({ txs }: { txs: BridgeTransaction[] }) => useBridgeNotifications(txs), {
      initialProps: { txs: [makeBridgeTx({ id: 'tx-1', status: 'bridge_in_progress' })] },
    })
    await enable(result)

    // Same status, new array/object references - exactly what a real poll refetch produces.
    rerender({ txs: [makeBridgeTx({ id: 'tx-1', status: 'bridge_in_progress' })] })

    expect(MockNotification.instances).toHaveLength(0)
  })

  it('does not fire for a transaction on its first sighting', async () => {
    const { result, rerender } = renderHook(({ txs }: { txs: BridgeTransaction[] }) => useBridgeNotifications(txs), {
      initialProps: { txs: [] as BridgeTransaction[] },
    })
    await enable(result)

    rerender({ txs: [makeBridgeTx({ id: 'tx-1', status: 'complete' })] })

    expect(MockNotification.instances).toHaveLength(0)
  })

  it('never calls Notification.requestPermission on mount - only requestEnable() does', () => {
    renderHook(() => useBridgeNotifications([makeBridgeTx({ status: 'complete' })]))
    expect(MockNotification.requestPermission).not.toHaveBeenCalled()
  })

  it('does not fire when permission is denied, and does not re-prompt the browser', async () => {
    MockNotification.permission = 'denied'
    const { result, rerender } = renderHook(({ txs }: { txs: BridgeTransaction[] }) => useBridgeNotifications(txs), {
      initialProps: { txs: [makeBridgeTx({ id: 'tx-1', status: 'bridge_in_progress' })] },
    })

    act(() => result.current.requestEnable())
    expect(MockNotification.requestPermission).not.toHaveBeenCalled()
    expect(result.current.permission).toBe('denied')

    rerender({ txs: [makeBridgeTx({ id: 'tx-1', status: 'complete' })] })
    expect(MockNotification.instances).toHaveLength(0)
  })

  it('does not throw when the Notification API is unavailable (SSR / unsupported browser)', () => {
    delete (window as unknown as { Notification?: unknown }).Notification

    expect(() => {
      const { result, rerender } = renderHook(({ txs }: { txs: BridgeTransaction[] }) => useBridgeNotifications(txs), {
        initialProps: { txs: [makeBridgeTx({ id: 'tx-1', status: 'bridge_in_progress' })] },
      })
      act(() => result.current.requestEnable())
      rerender({ txs: [makeBridgeTx({ id: 'tx-1', status: 'complete' })] })
    }).not.toThrow()
  })

  it('does not re-fire a transition that was already notified before a remount', async () => {
    const { result, rerender, unmount } = renderHook(
      ({ txs }: { txs: BridgeTransaction[] }) => useBridgeNotifications(txs),
      { initialProps: { txs: [makeBridgeTx({ id: 'tx-1', status: 'bridge_in_progress' })] } },
    )
    await enable(result)
    rerender({ txs: [makeBridgeTx({ id: 'tx-1', status: 'complete' })] })
    expect(MockNotification.instances).toHaveLength(1)

    unmount()

    // Remount races a poll that resolves with the same already-notified status.
    const second = renderHook(({ txs }: { txs: BridgeTransaction[] }) => useBridgeNotifications(txs), {
      initialProps: { txs: [makeBridgeTx({ id: 'tx-1', status: 'complete' })] },
    })
    await enable(second.result)

    expect(MockNotification.instances).toHaveLength(1)
  })
})
