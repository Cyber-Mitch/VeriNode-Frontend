import { create } from "zustand"
import { persist, createJSONStorage } from "zustand/middleware"

/**
 * Optimistic staking store.
 *
 * Each staking action moves through a small state machine:
 *
 *   idle ──begin──▶ pending ──confirm──▶ confirmed
 *                      └──────fail──────▶ failed (balance rolled back)
 *
 * The optimistic balance and the in-flight `pending` list are persisted to
 * sessionStorage so they survive component remounts (e.g. tab navigation)
 * while the underlying Soroban transaction is still reaching finality.
 */

export type StakingAction =
  | "stake"
  | "unstake"
  | "restake"
  | "delegate"
  | "undelegate"

export type OptimisticStatus = "pending" | "confirmed" | "failed"

/** Signed effect of each action on the user's spendable balance. */
export const ACTION_DELTA: Record<StakingAction, 1 | -1> = {
  stake: -1,
  restake: -1,
  delegate: -1,
  unstake: 1,
  undelegate: 1,
}

/** Compute the balance delta for an action (negative = balance decreases). */
export function actionDelta(action: StakingAction, amount: number): number {
  return ACTION_DELTA[action] * amount
}

export interface PendingStake {
  /** Client-generated UUID v4 used to track the operation before a real hash exists. */
  optimisticTxId: string
  action: StakingAction
  amount: number
  /** Mapping optimisticTxId -> real on-chain hash, filled once submitted. */
  realTxHash: string | null
  status: OptimisticStatus
  createdAt: number
  /** Decoded failure reason, set when status === 'failed'. */
  error: { reason: string } | null
}

interface StakingState {
  /** Last known spendable balance with optimistic deltas applied. `null` until initialised. */
  optimisticBalance: number | null
  /** In-flight (and recently settled) optimistic operations. */
  pending: PendingStake[]

  /** Seed the balance from the confirmed on-chain value (does not touch pending deltas). */
  initBalance: (balance: number) => void

  /** Apply an optimistic operation: adjust balance immediately and push a pending entry. */
  beginOptimistic: (entry: {
    optimisticTxId: string
    action: StakingAction
    amount: number
  }) => void

  /** Attach the real on-chain hash once the transaction has been submitted. */
  attachHash: (optimisticTxId: string, realTxHash: string) => void

  /** Mark an operation confirmed. The optimistic delta is already reflected, so keep it. */
  confirm: (optimisticTxId: string) => void

  /** Mark an operation failed and roll the balance back by the inverse delta. */
  fail: (optimisticTxId: string, reason: string) => void

  /** Remove a settled entry (called after the success/error toast window). */
  removePending: (optimisticTxId: string) => void

  reset: () => void
}

const noopStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
}

export const useStakingStore = create<StakingState>()(
  persist(
    (set) => ({
      optimisticBalance: null,
      pending: [],

      initBalance: (balance) =>
        set((s) =>
          // Only seed when we have no in-flight optimistic deltas, otherwise a
          // background balance refetch would clobber a pending optimistic value.
          s.pending.some((p) => p.status === "pending")
            ? s
            : { optimisticBalance: balance }
        ),

      beginOptimistic: ({ optimisticTxId, action, amount }) =>
        set((s) => {
          const base = s.optimisticBalance ?? 0
          const entry: PendingStake = {
            optimisticTxId,
            action,
            amount,
            realTxHash: null,
            status: "pending",
            createdAt: Date.now(),
            error: null,
          }
          return {
            optimisticBalance: base + actionDelta(action, amount),
            pending: [entry, ...s.pending],
          }
        }),

      attachHash: (optimisticTxId, realTxHash) =>
        set((s) => ({
          pending: s.pending.map((p) =>
            p.optimisticTxId === optimisticTxId ? { ...p, realTxHash } : p
          ),
        })),

      confirm: (optimisticTxId) =>
        set((s) => ({
          pending: s.pending.map((p) =>
            p.optimisticTxId === optimisticTxId
              ? { ...p, status: "confirmed", error: null }
              : p
          ),
        })),

      fail: (optimisticTxId, reason) =>
        set((s) => {
          const target = s.pending.find(
            (p) => p.optimisticTxId === optimisticTxId
          )
          // Only roll back a balance that is still optimistically applied.
          const rollback =
            target && target.status === "pending"
              ? -actionDelta(target.action, target.amount)
              : 0
          return {
            optimisticBalance:
              s.optimisticBalance === null
                ? null
                : s.optimisticBalance + rollback,
            pending: s.pending.map((p) =>
              p.optimisticTxId === optimisticTxId
                ? { ...p, status: "failed", error: { reason } }
                : p
            ),
          }
        }),

      removePending: (optimisticTxId) =>
        set((s) => ({
          pending: s.pending.filter(
            (p) => p.optimisticTxId !== optimisticTxId
          ),
        })),

      reset: () => set({ optimisticBalance: null, pending: [] }),
    }),
    {
      name: "verinode-staking",
      storage: createJSONStorage(() =>
        typeof window !== "undefined" && window.sessionStorage
          ? window.sessionStorage
          : noopStorage
      ),
      // Persist only the optimistic data, not the action functions.
      partialize: (s) => ({
        optimisticBalance: s.optimisticBalance,
        pending: s.pending,
      }),
    }
  )
)
