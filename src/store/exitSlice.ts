/**
 * Zustand store for the voluntary exit workflow.
 *
 * Tracks:
 *  - current step in the 3-step wizard
 *  - cooldown timer state (60-second countdown)
 *  - per-epoch rate-limit counter (max 4 per epoch per operator)
 *  - the constructed unsigned exit message (hex blob + hash)
 *  - the signed blob returned from the cold-storage device
 *  - abort / broadcast lifecycle
 */

import { create } from 'zustand';

/** Represents the exit workflow's step in the 3-step wizard. */
export type ExitStep = 'idle' | 'initiate' | 'sign' | 'broadcast' | 'done' | 'aborted';

/** Maximum voluntary exits that may be submitted per epoch per operator. */
export const MAX_EXITS_PER_EPOCH = 4;

/** Cooldown window in seconds before broadcast is enabled. */
export const COOLDOWN_SECONDS = 60;

export interface ExitWorkflowState {
  // ── Wizard state ─────────────────────────────────────────────────
  step: ExitStep;
  validatorIndex: number | null;
  /** Current epoch fetched from the beacon node. */
  currentEpoch: number | null;
  /** Hex blob of the SSZ-encoded unsigned VoluntaryExit message. */
  unsignedHexBlob: string | null;
  /** SHA-256 hash of the SSZ bytes (for audit log). */
  messageHash: string | null;
  /** Signed blob pasted / scanned by the operator from cold storage. */
  signedBlob: string | null;

  // ── Cooldown timer ────────────────────────────────────────────────
  /** Timestamp (ms) when the cooldown started; null when no cooldown active. */
  cooldownStartedAt: number | null;
  /** Seconds remaining in the cooldown (derived; updated by the hook). */
  cooldownSecondsLeft: number;

  // ── Rate limiting ─────────────────────────────────────────────────
  /** Epoch during which exits have been counted. */
  rateLimitEpoch: number | null;
  /** Number of exits initiated in the current rate-limit epoch. */
  exitsThisEpoch: number;

  // ── Error / loading ───────────────────────────────────────────────
  loading: boolean;
  error: string | null;

  // ── Audit entry ID ────────────────────────────────────────────────
  auditEntryId: string | null;

  // ── Actions ───────────────────────────────────────────────────────
  initiate: (
    validatorIndex: number,
    currentEpoch: number,
    unsignedHexBlob: string,
    messageHash: string,
    auditEntryId: string,
  ) => void;
  setCooldownSecondsLeft: (seconds: number) => void;
  setSignedBlob: (blob: string) => void;
  /** Advance the wizard to the sign step (step 2) without setting a blob. */
  advanceToSign: () => void;
  confirmBroadcast: () => void;
  markDone: () => void;
  abort: () => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  /** Increments the per-epoch counter; returns false if the rate limit is exceeded. */
  checkAndIncrementRateLimit: (epoch: number) => boolean;
  reset: () => void;
}

const initialState: Omit<
  ExitWorkflowState,
  | 'initiate'
  | 'setCooldownSecondsLeft'
  | 'setSignedBlob'
  | 'advanceToSign'
  | 'confirmBroadcast'
  | 'markDone'
  | 'abort'
  | 'setLoading'
  | 'setError'
  | 'checkAndIncrementRateLimit'
  | 'reset'
> = {
  step: 'idle',
  validatorIndex: null,
  currentEpoch: null,
  unsignedHexBlob: null,
  messageHash: null,
  signedBlob: null,
  cooldownStartedAt: null,
  cooldownSecondsLeft: COOLDOWN_SECONDS,
  rateLimitEpoch: null,
  exitsThisEpoch: 0,
  loading: false,
  error: null,
  auditEntryId: null,
};

export const useExitStore = create<ExitWorkflowState>((set, get) => ({
  ...initialState,

  initiate(validatorIndex, currentEpoch, unsignedHexBlob, messageHash, auditEntryId) {
    set({
      step: 'initiate',
      validatorIndex,
      currentEpoch,
      unsignedHexBlob,
      messageHash,
      auditEntryId,
      signedBlob: null,
      cooldownStartedAt: Date.now(),
      cooldownSecondsLeft: COOLDOWN_SECONDS,
      error: null,
    });
  },

  setCooldownSecondsLeft(seconds) {
    set({ cooldownSecondsLeft: Math.max(0, seconds) });
  },

  setSignedBlob(blob) {
    // Advance to broadcast-review step once the operator provides a valid signed blob.
    set({ step: 'broadcast', signedBlob: blob });
  },

  advanceToSign() {
    set({ step: 'sign' });
  },

  confirmBroadcast() {
    set({ step: 'broadcast' });
  },

  markDone() {
    set({ step: 'done' });
  },

  abort() {
    set({ step: 'aborted', cooldownStartedAt: null, cooldownSecondsLeft: COOLDOWN_SECONDS });
  },

  setLoading(loading) {
    set({ loading });
  },

  setError(error) {
    set({ error });
  },

  checkAndIncrementRateLimit(epoch) {
    const { rateLimitEpoch, exitsThisEpoch } = get();
    if (rateLimitEpoch !== epoch) {
      // New epoch — reset counter
      set({ rateLimitEpoch: epoch, exitsThisEpoch: 1 });
      return true;
    }
    if (exitsThisEpoch >= MAX_EXITS_PER_EPOCH) {
      return false;
    }
    set({ exitsThisEpoch: exitsThisEpoch + 1 });
    return true;
  },

  reset() {
    set({ ...initialState });
  },
}));
