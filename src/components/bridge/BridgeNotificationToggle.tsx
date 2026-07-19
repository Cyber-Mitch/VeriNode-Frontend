'use client'

import { useBridgeNotifications } from '@/src/hooks/useBridgeNotifications'
import type { BridgeTransaction } from '@/src/types/bridge'

export interface BridgeNotificationToggleProps {
  transactions: BridgeTransaction[]
}

/**
 * Opt-in control for status-change notifications. Notification.requestPermission()
 * is only ever called from this button's onClick (a user gesture) - never on
 * mount. Renders nothing when the Notification API isn't available (SSR /
 * unsupported browser) rather than showing a control that can't work.
 */
export function BridgeNotificationToggle({ transactions }: BridgeNotificationToggleProps) {
  const { supported, permission, enabled, requestEnable, disable } = useBridgeNotifications(transactions)

  if (!supported) return null

  if (permission === 'denied') {
    return <span className="text-xs text-slate-500">Notifications blocked in browser settings</span>
  }

  return (
    <button
      type="button"
      aria-pressed={enabled}
      onClick={() => (enabled ? disable() : requestEnable())}
      className="rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-white/5"
    >
      {enabled ? 'Notifications on' : 'Enable notifications'}
    </button>
  )
}
