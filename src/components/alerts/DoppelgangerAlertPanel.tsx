'use client';

// Doppelganger Alert Panel
//
// Displays the list of active doppelganger alerts with:
//   - Confidence score bar (colour-coded: amber <0.75, red ≥0.75)
//   - Affected validator public key (truncated)
//   - List of detected rogue peer IDs
//   - Scanned epoch range
//   - "Acknowledge" and "Suppress" action buttons
//
// Reads from the alertSlice Zustand store. Action callbacks are forwarded from
// the parent (typically AlertBanner) which holds the useDoppelgangerDetection
// hook instance.

import { useAlertStore } from '@/src/store/alertSlice';
import type { DoppelgangerAlert } from '@/src/store/alertSlice';

// ── Helpers ───────────────────────────────────────────────────────────────────

function truncatePubkey(pubkey: string): string {
  if (pubkey.length <= 18) return pubkey;
  return `${pubkey.slice(0, 10)}…${pubkey.slice(-8)}`;
}

function confidenceColor(score: number): string {
  if (score >= 0.75) return 'bg-red-500';
  if (score >= 0.5) return 'bg-amber-500';
  return 'bg-yellow-400';
}

function confidenceTextColor(score: number): string {
  if (score >= 0.75) return 'text-red-700';
  if (score >= 0.5) return 'text-amber-700';
  return 'text-yellow-700';
}

function formatPct(score: number): string {
  return `${Math.round(score * 100)}%`;
}

// ── Sub-components ────────────────────────────────────────────────────────────

interface ConfidenceBarProps {
  score: number;
}

function ConfidenceBar({ score }: ConfidenceBarProps) {
  const pct = Math.min(100, Math.round(score * 100));
  return (
    <div className="flex items-center gap-2">
      <div
        className="h-2 w-28 overflow-hidden rounded-full bg-gray-200"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Confidence score ${pct}%`}
      >
        <div
          className={`h-full rounded-full transition-all ${confidenceColor(score)}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className={`text-xs font-semibold tabular-nums ${confidenceTextColor(score)}`}>
        {formatPct(score)}
      </span>
    </div>
  );
}

// ── Alert row ─────────────────────────────────────────────────────────────────

interface AlertRowProps {
  alert: DoppelgangerAlert;
  onAcknowledge: (id: string) => void;
  onSuppress: (
    id: string,
    pubkey: string,
    fromEpoch: number,
    toEpoch: number,
  ) => void;
}

function AlertRow({ alert, onAcknowledge, onSuppress }: AlertRowProps) {
  const { id, result, acknowledged, suppressed } = alert;
  const { pubkey, confidenceScore, unrecognisedPeerIds, scannedEpochs } = result;

  return (
    <li
      className={`rounded-lg border p-4 transition-opacity ${
        acknowledged || suppressed ? 'opacity-60' : 'opacity-100'
      } border-red-200 bg-red-50`}
      aria-label={`Doppelganger alert for key ${truncatePubkey(pubkey)}`}
    >
      {/* Header row */}
      <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-col gap-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-red-600">
            ⚠ Doppelganger Detected
          </span>
          <span
            className="font-mono text-sm text-gray-800"
            title={pubkey}
          >
            {truncatePubkey(pubkey)}
          </span>
        </div>
        <ConfidenceBar score={confidenceScore} />
      </div>

      {/* Rogue peer IDs */}
      {unrecognisedPeerIds.length > 0 && (
        <div className="mb-2">
          <span className="text-xs font-medium text-gray-600">
            Rogue peer{unrecognisedPeerIds.length !== 1 ? 's' : ''} ({unrecognisedPeerIds.length}):
          </span>
          <ul className="mt-0.5 flex flex-wrap gap-1">
            {unrecognisedPeerIds.map((pid) => (
              <li
                key={pid}
                className="rounded bg-red-100 px-1.5 py-0.5 font-mono text-xs text-red-800"
              >
                {pid}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Epoch range */}
      <p className="mb-3 text-xs text-gray-500">
        Scanned epochs {scannedEpochs[0]}–{scannedEpochs[1]}
      </p>

      {/* Actions */}
      {!suppressed && (
        <div className="flex gap-2">
          {!acknowledged && (
            <button
              type="button"
              onClick={() => onAcknowledge(id)}
              className="rounded border border-gray-300 bg-white px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-400"
            >
              Acknowledge
            </button>
          )}
          <button
            type="button"
            onClick={() =>
              onSuppress(id, pubkey, scannedEpochs[0], scannedEpochs[1])
            }
            className="rounded border border-red-300 bg-white px-3 py-1 text-xs font-medium text-red-700 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-400"
          >
            Suppress (24 h)
          </button>
        </div>
      )}

      {suppressed && (
        <span className="text-xs italic text-gray-400">Suppressed</span>
      )}
    </li>
  );
}

// ── Panel ─────────────────────────────────────────────────────────────────────

export interface DoppelgangerAlertPanelProps {
  onAcknowledge: (id: string) => void;
  onSuppress: (
    id: string,
    pubkey: string,
    fromEpoch: number,
    toEpoch: number,
  ) => void;
  /** When true, only unacknowledged alerts are shown. Defaults to `false`. */
  hideAcknowledged?: boolean;
}

export function DoppelgangerAlertPanel({
  onAcknowledge,
  onSuppress,
  hideAcknowledged = false,
}: DoppelgangerAlertPanelProps) {
  const alerts = useAlertStore((s) => s.alerts);
  const scanStatus = useAlertStore((s) => s.scanStatus);
  const keysProcessed = useAlertStore((s) => s.keysProcessed);
  const keysTotal = useAlertStore((s) => s.keysTotal);
  const lastScannedAt = useAlertStore((s) => s.lastScannedAt);

  const visible = hideAcknowledged
    ? alerts.filter((a) => !a.acknowledged && !a.suppressed)
    : alerts;

  const activeCount = alerts.filter((a) => !a.acknowledged && !a.suppressed).length;

  return (
    <section
      aria-label="Doppelganger Alerts"
      className="w-full rounded-xl border border-red-200 bg-white shadow-sm"
    >
      {/* Panel header */}
      <header className="flex items-center justify-between rounded-t-xl border-b border-red-200 bg-red-50 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-base" aria-hidden="true">🔴</span>
          <h2 className="text-sm font-semibold text-red-800">
            Doppelganger Detection
          </h2>
          {activeCount > 0 && (
            <span
              className="rounded-full bg-red-600 px-2 py-0.5 text-xs font-bold text-white"
              aria-label={`${activeCount} active alert${activeCount !== 1 ? 's' : ''}`}
            >
              {activeCount}
            </span>
          )}
        </div>

        {/* Scan status indicator */}
        <div className="flex items-center gap-2 text-xs text-gray-500">
          {scanStatus === 'scanning' && (
            <>
              <span
                className="inline-block h-2 w-2 animate-pulse rounded-full bg-amber-400"
                aria-hidden="true"
              />
              <span>
                Scanning… {keysTotal > 0
                  ? `${keysProcessed} / ${keysTotal}`
                  : ''}
              </span>
            </>
          )}
          {scanStatus === 'complete' && lastScannedAt && (
            <span>
              Last scan:{' '}
              {new Date(lastScannedAt).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          )}
          {scanStatus === 'error' && (
            <span className="text-red-500">Scan error</span>
          )}
        </div>
      </header>

      {/* Alert list */}
      <div className="p-4">
        {visible.length === 0 ? (
          <p className="py-4 text-center text-sm text-gray-400">
            {scanStatus === 'scanning'
              ? 'Scanning for doppelgangers…'
              : 'No doppelganger activity detected.'}
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {visible.map((alert) => (
              <AlertRow
                key={alert.id}
                alert={alert}
                onAcknowledge={onAcknowledge}
                onSuppress={onSuppress}
              />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
