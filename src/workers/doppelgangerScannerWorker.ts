// Doppelganger scanner web worker.
//
// Processes validator public keys in batches of BATCH_SIZE (1,000) so the scan
// never blocks the UI thread. Key data is transferred as a JSON-encoded
// ArrayBuffer (zero-copy via Transferable) to avoid serialisation overhead.
//
// Message protocol
// ─────────────────
// Inbound  (main → worker):
//   { type: 'SCAN', payload: DoppelgangerScanRequest }
//   { type: 'ABORT', payload: { scanId: string } }
//
// Outbound (worker → main):
//   { type: 'PROGRESS', payload: DoppelgangerProgressMessage }
//   { type: 'RESULT',   payload: DoppelgangerResultMessage }
//   { type: 'ERROR',    payload: DoppelgangerErrorMessage }

import {
  analyseKey,
  filterObservationsForWindow,
  DETECTION_EPOCHS,
  type AttestationObservation,
  type ExpectedNodeConfig,
  type DoppelgangerResult,
} from '@/src/utils/doppelgangerDetector';
import { currentEpoch as getEpoch } from '@/src/utils/epochTime';

export const BATCH_SIZE = 1_000;

// ── Message types ─────────────────────────────────────────────────────────────

export interface MonitoredKey {
  pubkey: string;
  expectedNode: ExpectedNodeConfig;
}

export interface DoppelgangerScanRequest {
  /** Stable ID for this scan run; used for abort targeting. */
  scanId: string;
  /** Encoded MonitoredKey[] as UTF-8 JSON bytes in an ArrayBuffer. */
  keysBuffer: ArrayBuffer;
  /** Pre-fetched attestation observations for all keys in the window. */
  observations: AttestationObservation[];
  /** The starting epoch of the detection window. */
  fromEpoch: number;
  /** The ending epoch of the detection window (inclusive). */
  toEpoch: number;
}

export interface DoppelgangerProgressMessage {
  scanId: string;
  processed: number;
  total: number;
}

export interface DoppelgangerResultMessage {
  scanId: string;
  detected: DoppelgangerResult[];
  processed: number;
  total: number;
}

export interface DoppelgangerErrorMessage {
  scanId: string;
  message: string;
}

type InboundMessage =
  | { type: 'SCAN'; payload: DoppelgangerScanRequest }
  | { type: 'ABORT'; payload: { scanId: string } };

// ── Worker state ──────────────────────────────────────────────────────────────

let abortedScanId: string | null = null;

// ── Helpers ───────────────────────────────────────────────────────────────────

function post(
  msg:
    | { type: 'PROGRESS'; payload: DoppelgangerProgressMessage }
    | { type: 'RESULT'; payload: DoppelgangerResultMessage }
    | { type: 'ERROR'; payload: DoppelgangerErrorMessage },
): void {
  (self as unknown as Worker).postMessage(msg);
}

// ── Scan logic ────────────────────────────────────────────────────────────────

function processScan(req: DoppelgangerScanRequest): void {
  const { scanId, keysBuffer, observations, fromEpoch, toEpoch } = req;
  abortedScanId = null;

  let keys: MonitoredKey[];
  try {
    const text = new TextDecoder().decode(keysBuffer);
    const parsed: unknown = JSON.parse(text);
    if (!Array.isArray(parsed)) throw new Error('keysBuffer must encode a JSON array');
    keys = parsed as MonitoredKey[];
  } catch (err) {
    post({
      type: 'ERROR',
      payload: {
        scanId,
        message: err instanceof Error ? err.message : 'Failed to decode keysBuffer',
      },
    });
    return;
  }

  const total = keys.length;
  const detected: DoppelgangerResult[] = [];
  let processed = 0;

  const windowObservations = filterObservationsForWindow(observations, fromEpoch, toEpoch);

  const processBatch = (offset: number): void => {
    if (abortedScanId === scanId) return;

    const batch = keys.slice(offset, offset + BATCH_SIZE);
    for (const { pubkey, expectedNode } of batch) {
      if (abortedScanId === scanId) return;

      const keyObservations = windowObservations.filter((o) => o.pubkey === pubkey);
      const result = analyseKey(pubkey, keyObservations, expectedNode, fromEpoch, toEpoch);

      if (result.detected) {
        detected.push(result);
      }
    }

    processed += batch.length;

    post({
      type: 'PROGRESS',
      payload: { scanId, processed, total },
    });

    if (processed < total && abortedScanId !== scanId) {
      // Yield to the event loop between batches so the worker remains
      // responsive to ABORT messages.
      setTimeout(() => processBatch(offset + BATCH_SIZE), 0);
    } else if (abortedScanId !== scanId) {
      post({
        type: 'RESULT',
        payload: { scanId, detected, processed, total },
      });
    }
  };

  processBatch(0);
}

// ── Message handler ───────────────────────────────────────────────────────────

self.onmessage = (e: MessageEvent<InboundMessage>) => {
  const msg = e.data;
  switch (msg.type) {
    case 'SCAN':
      processScan(msg.payload);
      break;
    case 'ABORT':
      abortedScanId = msg.payload.scanId;
      break;
  }
};

// Re-export epoch helper so the worker bundle is self-contained.
export { getEpoch, DETECTION_EPOCHS };

export {};
