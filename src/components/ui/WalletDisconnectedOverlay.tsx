"use client"

import { useEffect, useState } from "react"

interface OverlayProps {
  walletType: string | null
  graceCountdown: number
  onCancel: () => void
}

export function WalletDisconnectedOverlay({
  walletType,
  graceCountdown,
  onCancel,
}: OverlayProps) {
  const [seconds, setSeconds] = useState(Math.ceil(graceCountdown / 1000))

  useEffect(() => {
    setSeconds(Math.ceil(graceCountdown / 1000))
  }, [graceCountdown])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="mx-4 w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-2xl dark:bg-zinc-900">
        <div className="mb-4 text-5xl">🔌</div>
        <h2 className="mb-2 text-xl font-bold text-zinc-900 dark:text-zinc-50">
          Wallet Disconnected
        </h2>
        <p className="mb-4 text-sm text-zinc-500 dark:text-zinc-400">
          Your{" "}
          <span className="font-semibold capitalize">
            {walletType ?? "wallet"}
          </span>{" "}
          connection was lost.
        </p>

        <div className="mb-6">
          <div className="text-4xl font-bold text-red-500">{seconds}</div>
          <p className="text-xs text-zinc-400">seconds until session ends</p>
        </div>

        <p className="mb-6 text-sm text-zinc-500 dark:text-zinc-400">
          Reconnect your wallet or press Cancel to re-check.
        </p>

        <button
          onClick={onCancel}
          className="rounded-lg bg-zinc-900 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
