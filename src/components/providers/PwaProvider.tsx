"use client"

import { useEffect, type ReactNode } from "react"
import { OfflineBanner } from "@/src/components/layout/OfflineBanner"
import { usePwaInstall } from "@/src/hooks/usePwaInstall"

function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (
      typeof window === "undefined" ||
      !("serviceWorker" in navigator)
    ) {
      return
    }

    let registration: ServiceWorkerRegistration | null = null

    async function register() {
      try {
        registration = await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
        })
      } catch (err) {
        console.warn("[PWA] Service worker registration failed", err)
      }
    }

    register()

    return () => {
      if (registration) {
        registration.unregister().catch(() => {})
      }
    }
  }, [])

  return null
}

function SyncMessageListener() {
  useEffect(() => {
    if (typeof window === "undefined") return

    const handler = (event: MessageEvent) => {
      if (event.data?.type === "SYNC_SUBMISSIONS") {
        console.info("[PWA] Sync event received — draining submission queue")
      }
    }

    navigator.serviceWorker?.addEventListener("message", handler)
    return () => {
      navigator.serviceWorker?.removeEventListener("message", handler)
    }
  }, [])

  return null
}

export function PwaProvider({ children }: { children: ReactNode }) {
  const { showInstallButton, install } = usePwaInstall()

  return (
    <>
      <ServiceWorkerRegistrar />
      <SyncMessageListener />
      <OfflineBanner />
      {children}
      {showInstallButton && (
        <div className="fixed bottom-4 right-4 z-50">
          <button
            onClick={install}
            className="flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2.5 text-sm font-medium text-white shadow-lg transition-colors hover:bg-sky-500"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Install App
          </button>
        </div>
      )}
    </>
  )
}
