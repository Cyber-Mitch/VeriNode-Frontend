/**
 * useVoluntaryExit – main hook managing the 3-step voluntary-exit workflow.
 *
 * Responsibilities:
 *  1. Build the unsigned SSZ exit message from validator index + current epoch.
 *  2. Drive the 60-second cooldown timer (countdown → enables broadcast).
 *  3. Enforce a 4-per-epoch rate limit per operator account.
 *  4. Validate the signed blob submitted in step 2.
 *  5. Post the signed exit to the beacon node (step 3).
 *  6. Write all state transitions to the IndexedDB audit trail.
 *  7. Allow the operator to abort before broadcast (exit is irreversible after).
 */

'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useExitStore, COOLDOWN_SECONDS, MAX_EXITS_PER_EPOCH } from '@/src/store/exitSlice';
import {
  buildUnsignedExitMessage,
  fetchCurrentEpoch,
  isValidSignatureHex,
} from '@/src/utils/exitMessageBuilder';
import {
  saveExitAuditEntry,
  updateExitAuditStatus,
  generateExitAuditId,
} from '@/src/services/exitAuditStore';
import { postVoluntaryExit } from '@/src/services/beaconChainService';
import type { VoluntaryExitPayload } from '@/src/services/beaconChainService';

export interface UseVoluntaryExitOptions {
  beaconNodeUrl?: string;
  /** Operator identifier stored in the audit log (e.g. wallet pubkey). */
  operatorId?: string;
}

export interface UseVoluntaryExitReturn {
  // ── State ────────────────────────────────────────────────────────
  step: ReturnType<typeof useExitStore.getState>['step'];
  validatorIndex: number | null;
  currentEpoch: number | null;
  unsignedHexBlob: string | null;
  messageHash: string | null;
  signedBlob: string | null;
  cooldownSecondsLeft: number;
  loading: boolean;
  error: string | null;
  /** True when the 60-second cooldown has elapsed and broadcast is enabled. */
  cooldownComplete: boolean;

  // ── Actions ──────────────────────────────────────────────────────
  /** Step 1 → fetches epoch, builds SSZ blob, starts cooldown. */
  initiateExit: (validatorIndex: number) => Promise<void>;
  /** Step 2 → validates and stores the signed blob from cold storage. */
  acceptSignedBlob: (signedHex: string) => void;
  /** Step 3 → broadcasts to beacon node (only enabled after cooldown). */
  broadcastExit: () => Promise<void>;
  /** Cancel the in-progress exit (only before broadcast). */
  abortExit: () => void;
  /** Reset the wizard to idle. */
  reset: () => void;
}

export function useVoluntaryExit(options: UseVoluntaryExitOptions = {}): UseVoluntaryExitReturn {
  const { beaconNodeUrl, operatorId } = options;

  const {
    step,
    validatorIndex,
    currentEpoch,
    unsignedHexBlob,
    messageHash,
    signedBlob,
    cooldownStartedAt,
    cooldownSecondsLeft,
    auditEntryId,
    loading,
    error,
    initiate,
    setCooldownSecondsLeft,
    setSignedBlob,
    confirmBroadcast,
    markDone,
    abort,
    setLoading,
    setError,
    checkAndIncrementRateLimit,
    reset,
  } = useExitStore();

  // ── Cooldown tick ──────────────────────────────────────────────────────────
  const timerRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!cooldownStartedAt) {
      // No active cooldown
      if (timerRef.current !== undefined) {
        window.clearInterval(timerRef.current);
        timerRef.current = undefined;
      }
      return;
    }

    const tick = () => {
      const elapsed = Math.floor((Date.now() - cooldownStartedAt) / 1000);
      const remaining = Math.max(0, COOLDOWN_SECONDS - elapsed);
      setCooldownSecondsLeft(remaining);
      if (remaining === 0 && timerRef.current !== undefined) {
        window.clearInterval(timerRef.current);
        timerRef.current = undefined;
      }
    };

    tick(); // immediate first tick
    timerRef.current = window.setInterval(tick, 500);

    return () => {
      if (timerRef.current !== undefined) {
        window.clearInterval(timerRef.current);
        timerRef.current = undefined;
      }
    };
  }, [cooldownStartedAt, setCooldownSecondsLeft]);

  const cooldownComplete = cooldownSecondsLeft === 0 && cooldownStartedAt !== null;

  // ── Step 1: initiate ───────────────────────────────────────────────────────
  const initiateExit = useCallback(
    async (validatorIdx: number) => {
      setError(null);
      setLoading(true);
      try {
        // Fetch current epoch
        const epoch = await fetchCurrentEpoch(beaconNodeUrl);

        // Rate-limit check
        const allowed = checkAndIncrementRateLimit(epoch);
        if (!allowed) {
          throw new Error(
            `Rate limit reached: max ${MAX_EXITS_PER_EPOCH} voluntary exits per epoch.`,
          );
        }

        // Build unsigned message
        const { hexBlob, messageHash: hash } = await buildUnsignedExitMessage({
          epoch,
          validatorIndex: validatorIdx,
        });

        // Audit log — write before anything else
        const entryId = generateExitAuditId();
        await saveExitAuditEntry({
          id: entryId,
          validatorIndex: validatorIdx,
          epoch,
          unsignedMsgHash: hash,
          timestamp: Date.now(),
          broadcastStatus: 'pending',
          ...(operatorId ? { operatorId } : {}),
        });

        // Update store
        initiate(validatorIdx, epoch, hexBlob, hash, entryId);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to initiate exit');
      } finally {
        setLoading(false);
      }
    },
    [beaconNodeUrl, operatorId, checkAndIncrementRateLimit, initiate, setError, setLoading],
  );

  // ── Step 2: accept signed blob ─────────────────────────────────────────────
  const acceptSignedBlob = useCallback(
    (signedHex: string) => {
      setError(null);
      if (!isValidSignatureHex(signedHex)) {
        setError(
          'Invalid signature format. Expected a 192-character hex BLS signature (with or without 0x prefix).',
        );
        return;
      }
      setSignedBlob(signedHex.startsWith('0x') ? signedHex : `0x${signedHex}`);
    },
    [setSignedBlob, setError],
  );

  // ── Step 3: broadcast ─────────────────────────────────────────────────────
  const broadcastExit = useCallback(async () => {
    if (!cooldownComplete) {
      setError(`Please wait ${cooldownSecondsLeft}s before broadcasting.`);
      return;
    }
    if (!validatorIndex || !signedBlob || !currentEpoch || !unsignedHexBlob) {
      setError('Exit workflow is incomplete. Please restart.');
      return;
    }
    if (!beaconNodeUrl) {
      setError('No beacon node URL configured. Cannot broadcast.');
      return;
    }

    setError(null);
    setLoading(true);
    confirmBroadcast();

    try {
      const payload: VoluntaryExitPayload = {
        message: {
          epoch: String(currentEpoch),
          validator_index: String(validatorIndex),
        },
        // The signed blob already has the 0x prefix after acceptSignedBlob normalisation
        signature: signedBlob,
      };

      await postVoluntaryExit(beaconNodeUrl, payload);

      // Update audit log
      if (auditEntryId) {
        await updateExitAuditStatus(auditEntryId, 'broadcast');
      }

      markDone();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Broadcast failed';
      setError(msg);
      // Update audit log with failure
      if (auditEntryId) {
        await updateExitAuditStatus(auditEntryId, 'failed', msg);
      }
    } finally {
      setLoading(false);
    }
  }, [
    cooldownComplete,
    cooldownSecondsLeft,
    validatorIndex,
    signedBlob,
    currentEpoch,
    unsignedHexBlob,
    beaconNodeUrl,
    auditEntryId,
    setError,
    setLoading,
    confirmBroadcast,
    markDone,
  ]);

  // ── Abort ──────────────────────────────────────────────────────────────────
  const abortExit = useCallback(async () => {
    // Update audit log as aborted
    const { auditEntryId: entryId } = useExitStore.getState();
    if (entryId) {
      await updateExitAuditStatus(entryId, 'aborted');
    }
    abort();
  }, [abort]);

  return {
    step,
    validatorIndex,
    currentEpoch,
    unsignedHexBlob,
    messageHash,
    signedBlob,
    cooldownSecondsLeft,
    loading,
    error,
    cooldownComplete,
    initiateExit,
    acceptSignedBlob,
    broadcastExit,
    abortExit,
    reset,
  };
}
