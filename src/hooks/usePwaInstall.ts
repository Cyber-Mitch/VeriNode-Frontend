"use client"

import { useState, useEffect, useRef, useCallback } from "react"

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>
}

const PAGE_VISIT_KEY = "verinode:pwa:pageVisits"
const MIN_VISITS = 3
const MIN_ENGAGEMENT_MS = 5 * 60 * 1000

export function usePwaInstall() {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null)
  const [showInstallButton, setShowInstallButton] = useState(false)
  const sessionStartRef = useRef<number | null>(null)

  useEffect(() => {
    if (sessionStartRef.current === null) {
      sessionStartRef.current = Date.now()
    }
    const visits = Number(sessionStorage.getItem(PAGE_VISIT_KEY) || "0") + 1
    sessionStorage.setItem(PAGE_VISIT_KEY, String(visits))

    const handler = (e: Event) => {
      e.preventDefault()
      const promptEvent = e as BeforeInstallPromptEvent
      setDeferredPrompt(promptEvent)

      const visits = Number(sessionStorage.getItem(PAGE_VISIT_KEY) || "0")
      const elapsed = Date.now() - (sessionStartRef.current ?? Date.now())
      if (visits >= MIN_VISITS || elapsed >= MIN_ENGAGEMENT_MS) {
        setShowInstallButton(true)
      }
    }

    window.addEventListener("beforeinstallprompt", handler)

    return () => {
      window.removeEventListener("beforeinstallprompt", handler)
    }
  }, [])

  const install = useCallback(async () => {
    if (!deferredPrompt) return

    deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice

    if (outcome === "accepted") {
      setDeferredPrompt(null)
      setShowInstallButton(false)
    }
  }, [deferredPrompt])

  return { showInstallButton, install }
}
