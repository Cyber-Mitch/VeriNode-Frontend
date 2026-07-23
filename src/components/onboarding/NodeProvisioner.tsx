"use client";

import { useCallback, useState } from "react";
import { useOnboardingFlow } from "@/src/hooks/useOnboardingFlow";
import type { NodeConfig } from "@/src/store/onboardingStore";

// ---------------------------------------------------------------------------
// Sub-steps inside the pairing panel
// ---------------------------------------------------------------------------

function EmptyState({ onPair }: { onPair: (config: NodeConfig) => void }) {
  const [serverEndpoint, setServerEndpoint] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (isGenerating || !serverEndpoint.trim()) return;

      try {
        setIsGenerating(true);
        const config: NodeConfig = {
          nodeId: crypto.randomUUID(),
          serverEndpoint: serverEndpoint.trim(),
        };
        await onPair(config);
      } finally {
        setIsGenerating(false);
      }
    },
    [serverEndpoint, isGenerating, onPair],
  );

  return (
    <div className="flex flex-col items-center gap-6 py-8 text-center">
      <div className="size-16 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
        <svg
          className="size-8 text-blue-600 dark:text-blue-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9 17.25v1.007a3 3 0 0 1-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0 1 15 18.257V17.25m6-12V15a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 15V5.25m18 0A2.25 2.25 0 0 0 18.75 3H5.25A2.25 2.25 0 0 0 3 5.25m18 0V12a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 12V5.25"
          />
        </svg>
      </div>

      <div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          No node configured yet
        </h3>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Enter your node&apos;s server endpoint to generate a pairing QR code.
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="flex w-full max-w-sm flex-col gap-3"
      >
        <input
          type="text"
          placeholder="https://node-01.example.com:8443"
          value={serverEndpoint}
          onChange={(e) => setServerEndpoint(e.target.value)}
          className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-white dark:placeholder-gray-500"
          required
        />
        <button
          type="submit"
          disabled={isGenerating || !serverEndpoint.trim()}
          className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isGenerating ? "Generating QR\u2026" : "Generate Pairing QR"}
        </button>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------------

function PairingQR({
  nodeConfig,
  qrDataUrl,
  expiresAt,
  onVerify,
  onRegenerate,
}: {
  nodeConfig: NodeConfig;
  qrDataUrl: string | null;
  expiresAt: number | null;
  onVerify: () => void;
  onRegenerate: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-6 py-6">
      <div className="flex flex-col items-center gap-1 text-center">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          Scan this QR code
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Use the physical setup utility to scan the code below.
        </p>
      </div>

      <div className="flex flex-col items-center gap-2">
        {qrDataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={qrDataUrl}
            alt="Node pairing QR code"
            className="rounded-lg border border-gray-200 dark:border-gray-700"
            width={256}
            height={256}
          />
        ) : (
          <div className="flex size-64 items-center justify-center rounded-lg border border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800">
            <span className="text-sm text-gray-400">Generating QR\u2026</span>
          </div>
        )}

        {expiresAt && (
          <QRCountdown expiresAt={expiresAt} />
        )}
      </div>

      <div className="flex w-full max-w-xs flex-col gap-2 rounded-lg bg-gray-50 p-3 text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-400">
        <div className="flex justify-between">
          <span>Node ID</span>
          <code className="font-mono text-blue-600 dark:text-blue-400">
            {nodeConfig.nodeId.slice(0, 16)}\u2026
          </code>
        </div>
        <div className="flex justify-between">
          <span>Endpoint</span>
          <code className="font-mono text-blue-600 dark:text-blue-400">
            {nodeConfig.serverEndpoint}
          </code>
        </div>
      </div>

      <div className="flex gap-3">
        <button
          onClick={onVerify}
          className="rounded-lg bg-green-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-green-700"
        >
          I&apos;ve scanned the code
        </button>
        <button
          onClick={onRegenerate}
          className="rounded-lg border border-gray-300 px-5 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
        >
          Generate new QR
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function QRCountdown({ expiresAt }: { expiresAt: number }) {
  const [remaining, setRemaining] = useState(() =>
    Math.max(0, Math.floor((expiresAt - Date.now()) / 1000)),
  );

  // Update every second
  useState(() => {
    const id = setInterval(() => {
      const r = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
      setRemaining(r);
      if (r <= 0) clearInterval(id);
    }, 1000);
    return () => clearInterval(id);
  });

  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;

  return (
    <span
      className={`text-xs font-mono ${
        remaining < 60
          ? "text-red-500 animate-pulse"
          : "text-gray-400"
      }`}
    >
      {remaining > 0
        ? `Expires in ${minutes}:${seconds.toString().padStart(2, "0")}`
        : "Expired"}
    </span>
  );
}

// ---------------------------------------------------------------------------

function VerifyingConnection() {
  return (
    <div className="flex flex-col items-center gap-4 py-8 text-center">
      <div className="size-12 animate-spin rounded-full border-4 border-blue-200 border-t-blue-600" />
      <div>
        <h3 className="font-semibold text-gray-900 dark:text-white">
          Waiting for node\u2026
        </h3>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          The physical setup utility should scan the QR and connect shortly.
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function PairingComplete({
  nodeConfig,
  onReset,
}: {
  nodeConfig: NodeConfig | null;
  onReset: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-4 py-8 text-center">
      <div className="size-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
        <svg
          className="size-8 text-green-600 dark:text-green-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
          />
        </svg>
      </div>

      <div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          Node paired successfully
        </h3>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          {nodeConfig?.serverEndpoint ?? ""} is now connected.
        </p>
      </div>

      <button
        onClick={onReset}
        className="rounded-lg border border-gray-300 px-5 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
      >
        Pair another node
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function NodeProvisioner() {
  const {
    step,
    nodeConfig,
    qrDataUrl,
    qrExpiresAt,
    connectionError,
    startPairing,
    verifyConnection,
    goToStep,
    reset,
  } = useOnboardingFlow();

  const handlePair = useCallback(
    async (config: NodeConfig) => {
      await startPairing(config);
    },
    [startPairing],
  );

  const handleVerify = useCallback(() => {
    verifyConnection();
  }, [verifyConnection]);

  const handleRegenerate = useCallback(() => {
    goToStep("idle");
  }, [goToStep]);

  return (
    <div className="mx-auto w-full max-w-md rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-900">
      {/* Step indicator */}
      <div className="mb-6 flex items-center justify-between px-1">
        {(["idle", "generate-pairing", "verify-connection", "complete"] as const).map(
          (s, i) => {
            const currentIdx = (["idle", "generate-pairing", "verify-connection", "complete"] as const).indexOf(step);
            const isActive = i <= currentIdx;
            return (
              <div key={s} className="flex items-center">
                <div
                  className={`flex size-3 items-center justify-center rounded-full ${
                    isActive
                      ? "bg-blue-600"
                      : "bg-gray-200 dark:bg-gray-700"
                  }`}
                />
                {i < 3 && (
                  <div
                    className={`h-0.5 w-12 sm:w-20 ${
                      i < currentIdx
                        ? "bg-blue-600"
                        : "bg-gray-200 dark:bg-gray-700"
                    }`}
                  />
                )}
              </div>
            );
          },
        )}
      </div>

      {/* Content area */}
      <div className="min-h-[280px]">
        {/* Error banner */}
        {connectionError && (
          <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
            {connectionError}
          </div>
        )}

        {step === "idle" && <EmptyState onPair={handlePair} />}

        {step === "generate-pairing" && nodeConfig && (
          <PairingQR
            nodeConfig={nodeConfig}
            qrDataUrl={qrDataUrl}
            expiresAt={qrExpiresAt}
            onVerify={handleVerify}
            onRegenerate={handleRegenerate}
          />
        )}

        {step === "verify-connection" && <VerifyingConnection />}

        {step === "complete" && (
          <PairingComplete nodeConfig={nodeConfig} onReset={reset} />
        )}
      </div>
    </div>
  );
}