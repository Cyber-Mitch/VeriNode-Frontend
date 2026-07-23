"use client"

import { useState, useEffect } from "react"

export function OfflineBanner() {
  const [offline, setOffline] = useState(() =>
    typeof navigator !== "undefined" && !navigator.onLine,
  )

  useEffect(() => {
    const handleOnline = () => setOffline(false)
    const handleOffline = () => setOffline(true)

    window.addEventListener("online", handleOnline)
    window.addEventListener("offline", handleOffline)

    return () => {
      window.removeEventListener("online", handleOnline)
      window.removeEventListener("offline", handleOffline)
    }
  }, [])

  if (!offline) return null

  return (
    <div
      role="alert"
      className="sticky top-0 z-40 flex items-center justify-center gap-2 bg-amber-500 px-4 py-2 text-sm font-medium text-black"
    >
      <span className="text-base" aria-hidden="true">
        &#x26A0;
      </span>
      You are offline — showing cached data. Some features may be unavailable.
    </div>
  )
}
