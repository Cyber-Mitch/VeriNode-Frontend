"use client"

import { type ReactNode } from "react"
import { useSessionWatcher } from "@/src/hooks/useSessionWatcher"
import { WalletDisconnectedOverlay } from "@/src/components/ui/WalletDisconnectedOverlay"

export function SessionGuard({ children }: { children: ReactNode }) {
  const { showOverlay, disconnectedWallet, graceCountdown, handleCancel } =
    useSessionWatcher()

  return (
    <>
      {showOverlay && (
        <WalletDisconnectedOverlay
          walletType={disconnectedWallet}
          graceCountdown={graceCountdown}
          onCancel={handleCancel}
        />
      )}
      {children}
    </>
  )
}
