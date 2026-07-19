// Doppelganger detection core logic.
//
// For each monitored validator public key, queries the last 2 epochs of
// attestation data, compares the observed signing peer IDs against the expected
// node, and computes a confidence score for the doppelganger event.
//
// Confidence formula (as specified in issue #501):
//   score = 0.6 × (unrecognised_peer_ids_count / total_observed_peers)
//         + 0.4 × (duty_slot_miss_rate_on_expected_node)
//
// A score ≥ 0.5 is considered a detected doppelganger.

import { SLOTS_PER_EPOCH } from '@/src/utils/epochTime';

export const DETECTION_EPOCHS = 2;
export const DOPPELGANGER_THRESHOLD = 0.5;
export const SLOTS_IN_DETECTION_WINDOW = SLOTS_PER_EPOCH * DETECTION_EPOCHS; // 64

// ── Types ────────────────────────────────────────────────────────────────────

/**
 * A single attestation observation returned by the beacon node gossip / API.
 * Represents one slot where an attestation was seen from a given peer.
 */
export interface AttestationObservation {
  /** Validator public key (0x-prefixed hex). */
  pubkey: string;
  /** Beacon slot number. */
  slot: number;
  /** Peer ID that sent / signed this attestation (libp2p peer ID string). */
  peerId: string;
  /** Source IP or Node-ID of the peer, if available. */
  sourceIp?: string;
}

/**
 * Expected node configuration for a monitored key — the node that *should* be
 * the only active signer for this key.
 */
export interface ExpectedNodeConfig {
  /** The primary known peer ID of this node. */
  peerId: string;
  /** Additional peer IDs the node may appear as (e.g. across restarts). */
  knownPeerIds?: string[];
  /** Whether this node is currently in a maintenance window. */
  inMaintenanceWindow?: boolean;
}

/**
 * Result of the doppelganger analysis for a single validator key over the
 * last DETECTION_EPOCHS (2) epochs.
 */
export interface DoppelgangerResult {
  /** Validator public key. */
  pubkey: string;
  /** Confidence score in [0, 1]. ≥ 0.5 indicates likely doppelganger. */
  confidenceScore: number;
  /** Set of unrecognised peer IDs that signed attestations for this key. */
  unrecognisedPeerIds: string[];
  /** Number of duty slots missed by the expected node in the window. */
  expectedNodeMisses: number;
  /** Total slots in the detection window that had attestation duties. */
  totalDutySlots: number;
  /** Whether a doppelganger is detected (score ≥ threshold). */
  detected: boolean;
  /** The epoch range that was scanned. */
  scannedEpochs: [number, number];
  /** Wall-clock timestamp (ms) when this result was produced. */
  detectedAt: number;
}

// ── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Build the full set of peer IDs that are "known good" for the expected node.
 */
function buildKnownPeerSet(config: ExpectedNodeConfig): Set<string> {
  const s = new Set<string>([config.peerId]);
  for (const id of config.knownPeerIds ?? []) s.add(id);
  return s;
}

// ── Core detector ────────────────────────────────────────────────────────────

/**
 * Analyse attestation observations for a single validator key and compute a
 * doppelganger confidence score.
 *
 * @param pubkey          The validator public key being inspected.
 * @param observations    All attestation observations for this key in the
 *                        detection window (last 2 epochs).
 * @param expectedNode    The node configuration for the expected signer.
 * @param fromEpoch       The start epoch of the detection window.
 * @param toEpoch         The end epoch of the detection window (inclusive).
 * @returns               A DoppelgangerResult with confidence score and
 *                        supporting evidence.
 */
export function analyseKey(
  pubkey: string,
  observations: AttestationObservation[],
  expectedNode: ExpectedNodeConfig,
  fromEpoch: number,
  toEpoch: number,
): DoppelgangerResult {
  const knownPeers = buildKnownPeerSet(expectedNode);
  const detectedAt = Date.now();

  // Slots where at least one attestation was observed (any peer).
  const allAttestingSlots = new Set<number>(observations.map((o) => o.slot));
  const totalDutySlots = allAttestingSlots.size;

  // Peer IDs that signed attestations for this key, excluding known-good peers.
  const unrecognisedPeerIds = new Set<string>();
  for (const obs of observations) {
    if (!knownPeers.has(obs.peerId)) {
      unrecognisedPeerIds.add(obs.peerId);
    }
  }

  // Slots where the expected node signed (its peer ID appeared).
  const expectedNodeSlots = new Set<number>(
    observations
      .filter((o) => knownPeers.has(o.peerId))
      .map((o) => o.slot),
  );

  // Slots with duties where the expected node did NOT sign.
  const expectedNodeMisses = totalDutySlots > 0
    ? [...allAttestingSlots].filter((s) => !expectedNodeSlots.has(s)).length
    : 0;

  // Compute confidence score.
  // Term 1: fraction of distinct observed peer IDs that are unrecognised.
  const allObservedPeerIds = new Set<string>(observations.map((o) => o.peerId));
  const unrecognisedRatio = allObservedPeerIds.size > 0
    ? unrecognisedPeerIds.size / allObservedPeerIds.size
    : 0;

  // Term 2: duty-slot miss rate on the expected node.
  const missRate = totalDutySlots > 0
    ? expectedNodeMisses / totalDutySlots
    : 0;

  const confidenceScore = Math.min(1, 0.6 * unrecognisedRatio + 0.4 * missRate);

  return {
    pubkey,
    confidenceScore,
    unrecognisedPeerIds: [...unrecognisedPeerIds],
    expectedNodeMisses,
    totalDutySlots,
    detected: confidenceScore >= DOPPELGANGER_THRESHOLD,
    scannedEpochs: [fromEpoch, toEpoch],
    detectedAt,
  };
}

/**
 * Filter a flat list of attestation observations to only those within the
 * given epoch range.
 */
export function filterObservationsForWindow(
  observations: AttestationObservation[],
  fromEpoch: number,
  toEpoch: number,
): AttestationObservation[] {
  const fromSlot = fromEpoch * SLOTS_PER_EPOCH;
  const toSlot = (toEpoch + 1) * SLOTS_PER_EPOCH - 1;
  return observations.filter((o) => o.slot >= fromSlot && o.slot <= toSlot);
}
