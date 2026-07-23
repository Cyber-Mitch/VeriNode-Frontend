"use client";

import { useCallback, useEffect } from "react";
import { useOnboardingStore, type OnboardingStep } from "@/src/store/onboardingStore";
import { generatePairingQR, isQRExpired } from "@/src/utils/qrGenerator";
import type { NodeConfig } from "@/src/store/onboardingStore";

/**
 * Allowed transitions between onboarding steps.
 */
const TRANSITIONS: Record<OnboardingStep, OnboardingStep[]> = {
  idle: ["generate-pairing"],
  "generate-pairing": ["verify-connection", "idle"],
  "verify-connection": ["complete", "generate-pairing"],
  complete: ["idle"],
};

function canTransition(from: OnboardingStep, to: OnboardingStep): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export function useOnboardingFlow() {
  const {
    step,
    nodeConfig,
    setupToken,
    qrDataUrl,
    qrExpiresAt,
    isConnecting,
    connectionError,
    setStep,
    setNodeConfig,
    setPairing,
    setConnecting,
    setConnectionError,
    reset,
  } = useOnboardingStore();

  /** Move to the next step if allowed. */
  const goToStep = useCallback(
    (next: OnboardingStep) => {
      if (canTransition(step, next)) {
        setStep(next);
      }
    },
    [step, setStep],
  );

  /** Start pairing: generate QR code for the given node config. */
  const startPairing = useCallback(
    async (config: NodeConfig) => {
      setNodeConfig(config);
      setStep("generate-pairing");

      const setupToken = crypto.randomUUID();

      try {
        const result = await generatePairingQR({
          nodeId: config.nodeId,
          serverEndpoint: config.serverEndpoint,
          setupToken,
        });

        setPairing(
          setupToken,
          result.nonce,
          result.dataUrl,
          result.expiresAt,
        );
      } catch (err) {
        setConnectionError(
          err instanceof Error ? err.message : "Failed to generate QR code",
        );
      }
    },
    [setNodeConfig, setStep, setPairing, setConnectionError],
  );

  /** Verify the node connection (simulate polling until QR used). */
  const verifyConnection = useCallback(() => {
    setStep("verify-connection");
    setConnecting(true);
    setConnectionError(null);

    // In a real app this polls the backend until the node
    // scans the QR and completes the handshake.
    // For now we simulate a short delay then complete.
    const poll = setInterval(() => {
      void (async () => {
        try {
          const res = await fetch("/api/v1/nodes/pairing-status", {
            credentials: "include",
          });
          if (res.ok) {
            const data = (await res.json()) as { paired: boolean };
            if (data.paired) {
              clearInterval(poll);
              setConnecting(false);
              setStep("complete");
            }
          }
        } catch {
          // polling – swallow transient errors
        }
      })();
    }, 2000);

    // Safety timeout: stop polling after 5 minutes
    setTimeout(() => {
      clearInterval(poll);
      setConnecting(false);
      setConnectionError("Pairing timed out. Please try again.");
    }, 300_000);

    return () => clearInterval(poll);
  }, [setStep, setConnecting, setConnectionError]);

  /** Check if the current QR has expired. */
  const isQrExpired = qrExpiresAt ? isQRExpired(qrExpiresAt) : false;

  // Auto-cleanup: reset if QR expires while in pairing step
  useEffect(() => {
    if (step === "generate-pairing" && isQrExpired && qrExpiresAt) {
      setConnectionError("QR code expired. Generate a new one.");
    }
  }, [step, isQrExpired, qrExpiresAt, setConnectionError]);

  return {
    // State
    step,
    nodeConfig,
    setupToken,
    qrDataUrl,
    qrExpiresAt,
    isConnecting,
    connectionError,
    isQrExpired,

    // Actions
    goToStep,
    startPairing,
    verifyConnection,
    reset,
  };
}