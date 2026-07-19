'use client';

// Global Alert Banner — integrates the doppelganger detection subsystem into
// the application shell.
//
// Mounts the useDoppelgangerDetection hook (which drives the worker-based
// scan lifecycle) and renders a collapsible banner at the top of the viewport
// whenever one or more unacknowledged doppelganger alerts are present.
//
// Usage: add <AlertBanner /> inside the root layout after <OfflineBanner />.
// The banner is self-contained and reads key configuration from environment
// variables or defaults to demo mode when NEXT_PUBLIC_BEACON_NODE_URL is unset.

import { useState } from 'react';
import { useDoppelgangerDetection } from '@/src/hooks/useDoppelgangerDetection';
import { DoppelgangerAlertPanel } from '@/src/components/alerts/DoppelgangerAlertPanel';
import { useAlertStore } from '@/src/store/alertSlice';
import type { MonitoredKey } from '@/src/workers/doppelgangerScannerWorker';

// ── Demo / stub key list ──────────────────────────────────────────────────────
// In production this would be sourced from a settings store or API.
// The demo seeds three keys with a simulated expected node so the panel
// renders meaningful output without a live beacon node.

const DEMO_KEYS: MonitoredKey[] = [
  {
    pubkey: '0xaabbccdd11223344aabbccdd11223344aabbccdd11223344aabbccdd1122334401',
    expectedNode: { peerId: 'QmExpectedPeer1' },
  },
  {
    pubkey: '0xaabbccdd11223344aabbccdd11223344aabbccdd11223344aabbccdd1122334402',
    expectedNode: { peerId: 'QmExpectedPeer1' },
  },
  {
    pubkey: '0xaabbccdd11223344aabbccdd11223344aabbccdd11223344aabbccdd1122334403',
    expectedNode: { peerId: 'QmExpectedPeer1', inMaintenanceWindow: true },
  },
];

// ── Component ─────────────────────────────────────────────────────────────────

export function AlertBanner() {
  const [expanded, setExpanded] = useState(false);

  const beaconNodeUrl =
    typeof process !== 'undefined'
      ? process.env.NEXT_PUBLIC_BEACON_NODE_URL
      : undefined;

  const { triggerScan, acknowledgeAlert, suppressAlert } = useDoppelgangerDetection({
    beaconNodeUrl,
    monitoredKeys: DEMO_KEYS,
    autoScan: true,
  });

  const activeAlerts = useAlertStore((s) =>
    s.alerts.filter((a) => !a.acknowledged && !a.suppressed),
  );

  if (activeAlerts.length === 0) return null;

  return (
    <div
      role="alert"
      aria-live="polite"
      className="sticky top-0 z-50 w-full border-b border-red-300 bg-red-50 shadow-sm"
    >
      {/* Summary bar */}
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-2">
        <div className="flex items-center gap-2">
          <span
            className="inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-red-500"
            aria-hidden="true"
          />
          <span className="text-sm font-semibold text-red-800">
            {activeAlerts.length} doppelganger alert
            {activeAlerts.length !== 1 ? 's' : ''} detected
          </span>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => triggerScan()}
            className="text-xs font-medium text-red-600 underline hover:text-red-800 focus:outline-none focus:ring-1 focus:ring-red-400"
          >
            Rescan now
          </button>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="rounded border border-red-300 bg-white px-3 py-1 text-xs font-medium text-red-700 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-400"
            aria-expanded={expanded}
            aria-controls="doppelganger-panel"
          >
            {expanded ? 'Hide' : 'View details'}
          </button>
        </div>
      </div>

      {/* Expanded panel */}
      {expanded && (
        <div
          id="doppelganger-panel"
          className="mx-auto max-w-5xl px-4 pb-4 pt-1"
        >
          <DoppelgangerAlertPanel
            onAcknowledge={acknowledgeAlert}
            onSuppress={suppressAlert}
            hideAcknowledged={false}
          />
        </div>
      )}
    </div>
  );
}
