"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { SessionWatcher } from "@/src/services/sessionWatcher"
import { useWalletContext } from "@/src/components/providers/WalletProvider"
import { useAuthStore } from "@/src/store/authStore"
import { useStakingStore } from "@/src/store/stakingStore"
import { useWeb3Auth } from "@/src/hooks/useWeb3Auth"
import { captureLogoutEvent } from "@/src/services/sentry"

const GRACE_PERIOD_MS = 10_000
const RECONNECT_POLL_MS = 500

export function useSessionWatcher() {
  const { providers, walletType } = useWalletContext()
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const { logout } = useWeb3Auth()

  const [showOverlay, setShowOverlay] = useState(false)
  const [disconnectedWallet, setDisconnectedWallet] = useState<string | null>(null)
  const [graceCountdown, setGraceCountdown] = useState(GRACE_PERIOD_MS)

  const watcherRef = useRef<SessionWatcher | null>(null)
  const graceTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const reconnectTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const sessionStartRef = useRef<number | null>(null)
  const previousRouteRef = useRef<string>("")
  const providersRef = useRef(providers)
  providersRef.current = providers

  const clearGraceTimers = useCallback(() => {
    if (graceTimerRef.current) {
      clearInterval(graceTimerRef.current)
      graceTimerRef.current = null
    }
    if (reconnectTimerRef.current) {
      clearInterval(reconnectTimerRef.current)
      reconnectTimerRef.current = null
    }
  }, [])

  const dismissOverlay = useCallback(() => {
    clearGraceTimers()
    setShowOverlay(false)
    setDisconnectedWallet(null)
    setGraceCountdown(GRACE_PERIOD_MS)
  }, [clearGraceTimers])

  useEffect(() => {
    previousRouteRef.current = window.location.pathname
    sessionStartRef.current = Date.now()
  }, [])

  useEffect(() => {
    if (!isAuthenticated) return

    const watcher = new SessionWatcher(providers)
    watcherRef.current = watcher

    const unsubDisconnect = watcher.on("disconnected", ({ walletType: wType }) => {
      const txCount = useStakingStore.getState().pending.length
      if (txCount > 0) return

      setDisconnectedWallet(wType)
      setShowOverlay(true)

      const startTime = Date.now()
      graceTimerRef.current = setInterval(() => {
        const elapsed = Date.now() - startTime
        const remaining = Math.max(0, GRACE_PERIOD_MS - elapsed)
        setGraceCountdown(remaining)

        if (remaining <= 0) {
          clearGraceTimers()
          captureLogoutEvent({
            previousRoute: previousRouteRef.current,
            walletType: wType,
            sessionDuration: Date.now() - (sessionStartRef.current ?? Date.now()),
            pendingTransactionsCount: useStakingStore.getState().pending.length,
          })
          logout()
        }
      }, 200)
    })

    const unsubReconnect = watcher.on("reconnected", () => {
      dismissOverlay()
    })

    watcher.start()

    return () => {
      watcher.stop()
      unsubDisconnect()
      unsubReconnect()
      clearGraceTimers()
    }
  }, [isAuthenticated, providers, logout, clearGraceTimers, dismissOverlay])

  const handleCancel = useCallback(() => {
    clearGraceTimers()

    let attempts = 0
    reconnectTimerRef.current = setInterval(() => {
      attempts++
      watcherRef.current?.recheckNow()

      const allStillDisconnected = Object.keys(providersRef.current).some((key) => {
        const provider = providersRef.current[key as keyof typeof providersRef.current]
        if (!provider) return false
        return typeof provider.isConnected === "function"
          ? !provider.isConnected()
          : true
      })

      if (!allStillDisconnected) {
        clearGraceTimers()
        dismissOverlay()
      } else if (attempts >= 6) {
        clearGraceTimers()
        captureLogoutEvent({
          previousRoute: previousRouteRef.current,
          walletType: walletType ?? "unknown",
          sessionDuration: Date.now() - (sessionStartRef.current ?? Date.now()),
          pendingTransactionsCount: useStakingStore.getState().pending.length,
        })
        logout()
      }
    }, RECONNECT_POLL_MS)
  }, [walletType, logout, clearGraceTimers, dismissOverlay])

  return { showOverlay, disconnectedWallet, graceCountdown, handleCancel }
}
