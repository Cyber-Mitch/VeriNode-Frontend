import { create } from "zustand"

interface AuthState {
  isAuthenticated: boolean
  walletType: string | null
  walletAddress: string | null
  sessionExpiresAt: number | null
  login: (walletType: string, walletAddress: string, sessionExpiresAt: number) => void
  setSessionExpiry: (expiresAt: number) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  isAuthenticated: false,
  walletType: null,
  walletAddress: null,
  sessionExpiresAt: null,
  login: (walletType, walletAddress, sessionExpiresAt) =>
    set({ isAuthenticated: true, walletType, walletAddress, sessionExpiresAt }),
  setSessionExpiry: (sessionExpiresAt) =>
    set({ sessionExpiresAt }),
  logout: () =>
    set({ isAuthenticated: false, walletType: null, walletAddress: null, sessionExpiresAt: null }),
}))
