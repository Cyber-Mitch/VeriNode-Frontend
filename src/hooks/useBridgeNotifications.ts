'use client'

import { useCallback, useEffect, useState } from 'react'
import { bridgeChainName } from '@/src/config/bridgeChains'
import { isBridgeFailureStatus, type BridgeTransaction, type BridgeTxStatus } from '@/src/types/bridge'

function isNotificationSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window
}

// Deliberately module-level, not component state: a transition that has
// already produced a notification must stay notified even if this hook's
// component remounts (e.g. navigating away from and back to the bridge page)
// within the same page session, and the last-seen status per tx must survive
// the same remount so a status that was already current before unmount isn't
// mistaken for a brand-new "first sighting" that then wrongly re-fires on the
// next real transition.
const notifiedTransitionKeys = new Set<string>()
const lastKnownStatusByTxId = new Map<string, BridgeTxStatus>()

/** Test-only: clears the module-level transition history between test cases. Not exported from the public hook surface used by app code. */
export function __resetBridgeNotificationState() {
  notifiedTransitionKeys.clear()
  lastKnownStatusByTxId.clear()
}

function notifyForTransition(tx: BridgeTransaction) {
  const srcName = bridgeChainName(tx.sourceChain)
  const destName = bridgeChainName(tx.destChain)

  if (tx.status === 'complete') {
    new Notification('Bridge transfer complete', {
      body: `Your bridge transaction from ${srcName} to ${destName} is complete!`,
      tag: `bridge-tx-${tx.id}`,
    })
    return
  }

  if (isBridgeFailureStatus(tx.status)) {
    new Notification('Bridge transfer needs attention', {
      body: `Your bridge transaction from ${srcName} to ${destName} ${tx.failureReason?.message ?? 'failed'}.`,
      tag: `bridge-tx-${tx.id}`,
    })
  }

  // Intermediate pipeline transitions (initiated -> source_confirmed, etc.)
  // are deliberately silent - only the two outcomes that need the user's
  // attention (done, or needs action) are worth interrupting them for.
}

export interface UseBridgeNotificationsResult {
  supported: boolean
  permission: NotificationPermission | 'unsupported'
  enabled: boolean
  /** Must be invoked from a user gesture (e.g. a toggle's onClick) - never called automatically. */
  requestEnable: () => void
  disable: () => void
}

/**
 * Fires a browser notification when a tracked transaction's status
 * transitions into 'complete' or a failure state - never on an unchanged
 * poll tick, and never for a transaction's first sighting (there's no prior
 * status to have transitioned from). Notifications only fire once the user
 * has explicitly opted in via requestEnable() (never requested on mount) and
 * the browser permission is granted; on unsupported browsers/SSR this is a
 * no-op rather than a throw.
 */
export function useBridgeNotifications(transactions: BridgeTransaction[]): UseBridgeNotificationsResult {
  const supported = isNotificationSupported()
  const [enabled, setEnabled] = useState(false)
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>(
    supported ? Notification.permission : 'unsupported',
  )

  const requestEnable = useCallback(() => {
    if (!supported) return
    if (Notification.permission === 'granted') {
      setPermission('granted')
      setEnabled(true)
      return
    }
    if (Notification.permission === 'denied') {
      // Browsers won't re-prompt once denied; reflect that rather than
      // calling requestPermission() again to no effect.
      setPermission('denied')
      return
    }
    void Notification.requestPermission().then((result) => {
      setPermission(result)
      setEnabled(result === 'granted')
    })
  }, [supported])

  const disable = useCallback(() => setEnabled(false), [])

  useEffect(() => {
    if (!supported) return

    const isActive = enabled && permission === 'granted'

    for (const tx of transactions) {
      const previousStatus = lastKnownStatusByTxId.get(tx.id)
      lastKnownStatusByTxId.set(tx.id, tx.status)

      const isFirstSighting = previousStatus === undefined
      const isTransition = !isFirstSighting && previousStatus !== tx.status
      if (!isTransition) continue

      // Statuses are still tracked while notifications are disabled/not yet
      // granted, so turning them on later doesn't replay past transitions.
      if (!isActive) continue

      const transitionKey = `${tx.id}:${tx.status}`
      if (notifiedTransitionKeys.has(transitionKey)) continue
      notifiedTransitionKeys.add(transitionKey)

      notifyForTransition(tx)
    }
  }, [transactions, supported, enabled, permission])

  return { supported, permission, enabled, requestEnable, disable }
}
