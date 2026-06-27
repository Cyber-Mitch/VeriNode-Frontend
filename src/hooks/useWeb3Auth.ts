import { useCallback, useEffect, useRef, useState } from "react";
import { useAuthStore } from "@/src/store/authStore";
import { useStakingStore } from "@/src/store/stakingStore";
import * as authApi from "@/src/lib/api/auth";
import type { WalletSigner } from "@/src/lib/walletSigners";

const REFRESH_LEAD_MS = 60_000; // refresh 1 minute before expiry

export function useWeb3Auth() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const sessionExpiresAt = useAuthStore((s) => s.sessionExpiresAt);
  const walletType = useAuthStore((s) => s.walletType);
  const authLogin = useAuthStore((s) => s.login);
  const authLogout = useAuthStore((s) => s.logout);
  const setSessionExpiry = useAuthStore((s) => s.setSessionExpiry);
  const resetStaking = useStakingStore((s) => s.reset);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Use a ref to hold the latest refresh function to avoid circular
  // useCallback deps between scheduleRefresh and refreshSession.
  const refreshSessionRef = useRef<() => Promise<void>>(async () => {});

  // ── Silent session refresh ──────────────────────────────────
  const refreshSession = useCallback(async () => {
    try {
      const session = await authApi.checkSession();
      if (session.valid && session.expiresAt > Date.now()) {
        setSessionExpiry(session.expiresAt);
        scheduleRefresh(session.expiresAt);
      } else {
        // Session expired while we were waiting
        authLogout();
        resetStaking();
      }
    } catch {
      // Network error — retry in 30 seconds
      refreshTimerRef.current = setTimeout(() => {
        refreshSessionRef.current();
      }, 30_000);
    }
  }, [authLogout, resetStaking, setSessionExpiry]);

  // Keep the ref up to date
  refreshSessionRef.current = refreshSession;

  // ── Schedule silent refresh ─────────────────────────────────
  function scheduleRefresh(expiresAt: number) {
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }

    const delay = Math.max(0, expiresAt - Date.now() - REFRESH_LEAD_MS);
    refreshTimerRef.current = setTimeout(() => {
      refreshSessionRef.current();
    }, delay);
  }

  // ── On mount: check existing session ────────────────────────
  useEffect(() => {
    // Only check if not already authenticated
    if (isAuthenticated) return;

    let cancelled = false;

    authApi
      .checkSession()
      .then((session) => {
        if (cancelled) return;
        if (session.valid && session.expiresAt > Date.now()) {
          import("@/src/lib/walletSigners").then(({ detectWalletSigner }) => {
            const signer = detectWalletSigner();
            if (signer) {
              signer
                .getPublicKey()
                .then((publicKey) => {
                  if (!cancelled) {
                    authLogin(signer.walletType, publicKey, session.expiresAt);
                    scheduleRefresh(session.expiresAt);
                  }
                })
                .catch(() => {
                  if (!cancelled) {
                    authLogin("freighter", "G...", session.expiresAt);
                  }
                });
            } else {
              if (!cancelled) {
                authLogin("unknown", "G...", session.expiresAt);
              }
            }
          });
        }
      })
      .catch(() => {
        // Server not reachable; skip restoration
      });

    return () => {
      cancelled = true;
    };
    // Run once on mount: isAuthenticated is checked via the early return;
    // Zustand setters are stable references so the captured closures are safe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Cleanup refresh timer on unmount ────────────────────────
  useEffect(() => {
    return () => {
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
    };
    // Run once on unmount — only cleans up the mutable ref
  }, []);

  // ── Login ───────────────────────────────────────────────────
  const login = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Step 1: Get challenge from server
      const challenge = await authApi.getChallenge();

      // Step 2: Detect wallet provider (deferred — only loaded on first login)
      const { detectWalletSigner } = await import("@/src/lib/walletSigners");
      const signer: WalletSigner | null = detectWalletSigner();
      if (!signer) {
        throw new Error(
          "No Stellar wallet extension detected. Please install Freighter, Lobstr, xBull, or Albedo."
        );
      }

      // Step 3: Get public key
      const publicKey = await signer.getPublicKey();
      if (!publicKey || !publicKey.startsWith("G")) {
        throw new Error("Invalid Stellar public key returned by wallet.");
      }

      // Step 4: Sign the challenge preimage
      const preimage = challenge.nonce + challenge.serverId;
      const signature = await signer.sign(preimage);

      // Step 5: Submit verification
      const verification = await authApi.verify({
        nonce: challenge.nonce,
        publicKey,
        signature,
      });

      // Step 6: Store session
      authLogin(signer.walletType, publicKey, verification.expiresAt);
      scheduleRefresh(verification.expiresAt);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Authentication failed";
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [authLogin]);

  // ── Logout ──────────────────────────────────────────────────
  const logout = useCallback(async () => {
    try {
      await authApi.logoutRequest();
    } catch {
      // best-effort; clear locally even if network fails
    }

    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }

    authLogout();
    resetStaking();
    window.location.href = "/login";
  }, [authLogout, resetStaking]);

  return {
    isAuthenticated,
    isLoading,
    error,
    sessionExpiresAt,
    walletType,
    login,
    logout,
  };
}
