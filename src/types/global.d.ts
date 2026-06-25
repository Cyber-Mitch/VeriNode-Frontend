import type { StoreApi } from "zustand"

interface AuthStore {
  isAuthenticated: boolean
  walletType: string | null
  walletAddress: string | null
  sessionExpiresAt: number | null
  login: (walletType: string, walletAddress: string, sessionExpiresAt: number) => void
  setSessionExpiry: (expiresAt: number) => void
  logout: () => void
}

interface StakingPendingEntry {
  optimisticTxId: string
  action: string
  amount: number
  realTxHash: string | null
  status: "pending" | "confirmed" | "failed"
  createdAt: number
  error: { reason: string } | null
}

interface StakingStore {
  optimisticBalance: number | null
  pending: StakingPendingEntry[]
  reset: () => void
}

declare global {
  interface Window {
    __TEST_STORES__?: {
      auth: StoreApi<AuthStore>
      staking: StoreApi<StakingStore>
    }
    freighterApi?: { isConnected: () => boolean }
    lobstr?: { isConnected: () => boolean }
    xbull?: { isConnected: () => boolean }
    albedo?: { isConnected: () => boolean }
  }
}
