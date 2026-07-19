// Alert state management for the doppelganger detection subsystem.
//
// Holds the list of active doppelganger alerts, scan lifecycle state, and
// per-key suppression flags. Components read from this store; the
// useDoppelgangerDetection hook writes to it.

import { create } from 'zustand';
import type { DoppelgangerResult } from '@/src/utils/doppelgangerDetector';

// ── Types ─────────────────────────────────────────────────────────────────────

/** Enriched alert record stored in the global alert state. */
export interface DoppelgangerAlert {
  /** Stable alert ID (pubkey + scannedEpochs concatenated). */
  id: string;
  /** Underlying detection result. */
  result: DoppelgangerResult;
  /** Whether the operator has acknowledged this alert. */
  acknowledged: boolean;
  /** Whether the operator has suppressed future alerts for this key. */
  suppressed: boolean;
  /** Timestamp (ms) when the alert was added to the store. */
  createdAt: number;
}

type ScanStatus = 'idle' | 'scanning' | 'complete' | 'error';

interface AlertState {
  // ── Scan lifecycle ─────────────────────────────────────────────────────────
  scanStatus: ScanStatus;
  scanError: string | null;
  lastScannedAt: number | null;
  /** Number of keys processed in the current / last scan. */
  keysProcessed: number;
  /** Total keys scheduled for the current / last scan. */
  keysTotal: number;

  // ── Alert list ─────────────────────────────────────────────────────────────
  alerts: DoppelgangerAlert[];

  // ── Actions ────────────────────────────────────────────────────────────────

  /** Mark a scan as in-progress with the total key count. */
  beginScan: (total: number) => void;
  /** Update progress (called after each worker batch). */
  updateScanProgress: (processed: number) => void;
  /** Mark the scan complete and persist the timestamp. */
  completeScan: () => void;
  /** Record a scan error. */
  failScan: (error: string) => void;

  /**
   * Add or update an alert from a detection result. If an alert for the same
   * (pubkey, scannedEpochs) already exists it is left unchanged (dedup
   * handled upstream); otherwise the new alert is prepended.
   */
  addAlert: (result: DoppelgangerResult) => void;

  /** Mark an alert as acknowledged by the operator. */
  acknowledgeAlert: (id: string) => void;

  /**
   * Suppress future alerts for the pubkey associated with this alert.
   * Also marks the alert as acknowledged.
   */
  suppressAlert: (id: string) => void;

  /** Remove all alerts for a given pubkey (called after suppression reset). */
  clearAlertsForKey: (pubkey: string) => void;

  /** Clear every active alert. */
  clearAllAlerts: () => void;

  /** Reset scan state + alerts (e.g. on unmount / config change). */
  reset: () => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildAlertId(result: DoppelgangerResult): string {
  return `${result.pubkey}:${result.scannedEpochs[0]}:${result.scannedEpochs[1]}`;
}

// ── Store ─────────────────────────────────────────────────────────────────────

export const useAlertStore = create<AlertState>((set, get) => ({
  scanStatus: 'idle',
  scanError: null,
  lastScannedAt: null,
  keysProcessed: 0,
  keysTotal: 0,
  alerts: [],

  beginScan: (total) =>
    set({ scanStatus: 'scanning', scanError: null, keysProcessed: 0, keysTotal: total }),

  updateScanProgress: (processed) => set({ keysProcessed: processed }),

  completeScan: () =>
    set({ scanStatus: 'complete', lastScannedAt: Date.now() }),

  failScan: (error) =>
    set({ scanStatus: 'error', scanError: error }),

  addAlert: (result) => {
    const id = buildAlertId(result);
    const existing = get().alerts.find((a) => a.id === id);
    if (existing) return; // already present — dedup
    const alert: DoppelgangerAlert = {
      id,
      result,
      acknowledged: false,
      suppressed: false,
      createdAt: Date.now(),
    };
    set((s) => ({ alerts: [alert, ...s.alerts] }));
  },

  acknowledgeAlert: (id) =>
    set((s) => ({
      alerts: s.alerts.map((a) => (a.id === id ? { ...a, acknowledged: true } : a)),
    })),

  suppressAlert: (id) =>
    set((s) => ({
      alerts: s.alerts.map((a) =>
        a.id === id ? { ...a, suppressed: true, acknowledged: true } : a,
      ),
    })),

  clearAlertsForKey: (pubkey) =>
    set((s) => ({
      alerts: s.alerts.filter((a) => a.result.pubkey !== pubkey),
    })),

  clearAllAlerts: () => set({ alerts: [] }),

  reset: () =>
    set({
      scanStatus: 'idle',
      scanError: null,
      lastScannedAt: null,
      keysProcessed: 0,
      keysTotal: 0,
      alerts: [],
    }),
}));
