// Sync committee computation utilities.
//
// A sync committee is a 256-member committee that serves light-client data.
// Membership is decided once per *sync committee period* (256 epochs ≈ 27h);
// a selected validator serves the entire period. Per-slot participation is
// binary (participated / missed) and missed duties carry heavy penalties.
//
// On a real network, membership is derived from beacon state at the period
// boundary via `get_selection_proof` against a random beacon (RANDAO). We
// can't reproduce BLS/shuffling without that state, so this module provides
// the period math plus a *deterministic model* of selection and participation
// used by the demo beacon provider. The real provider (in beaconChainService)
// should instead query the beacon API for actual committee membership.

/**
 * One sync committee period's data for a single validator.
 *
 * `participation` holds one bit per slot (0 = missed, 1 = participated),
 * length `SLOTS_PER_PERIOD` when `assigned`, else empty. Indexed by relative
 * slot: `coordsToRelativeSlot(epochInPeriod, slotInEpoch)`.
 */
export interface SyncCommitteePeriodData {
  validatorIndex: number;
  period: number;
  startEpoch: number;
  endEpoch: number;
  assigned: boolean;
  participation: Uint8Array;
  participatedCount: number;
  totalSlots: number;
  /** Aggregate participation rate for this period (0..1); 0 when not assigned. */
  participationRate: number;
}

export const SLOTS_PER_EPOCH = 32;
export const EPOCHS_PER_SYNC_COMMITTEE_PERIOD = 256;
export const SYNC_COMMITTEE_SIZE = 256;
export const SLOTS_PER_PERIOD = SLOTS_PER_EPOCH * EPOCHS_PER_SYNC_COMMITTEE_PERIOD; // 8,192

/** Mainnet beacon genesis (unix seconds) and slot duration. */
export const GENESIS_TIME = 1_606_824_023;
export const SECONDS_PER_SLOT = 12;

// ---- period / slot math --------------------------------------------------

export function epochToPeriod(epoch: number): number {
  return Math.floor(epoch / EPOCHS_PER_SYNC_COMMITTEE_PERIOD);
}

export function periodStartEpoch(period: number): number {
  return period * EPOCHS_PER_SYNC_COMMITTEE_PERIOD;
}

export function periodStartSlot(period: number): number {
  return periodStartEpoch(period) * SLOTS_PER_EPOCH;
}

/** Current sync committee period from a wall-clock time (defaults to genesis-relative now via slot). */
export function currentPeriod(nowMs: number): number {
  const slot = Math.max(0, Math.floor((nowMs / 1000 - GENESIS_TIME) / SECONDS_PER_SLOT));
  return epochToPeriod(Math.floor(slot / SLOTS_PER_EPOCH));
}

/** Convert a relative slot index (0..8191) within a period to grid coordinates. */
export function relativeSlotToCoords(relativeSlot: number): { epoch: number; slotInEpoch: number } {
  return {
    epoch: Math.floor(relativeSlot / SLOTS_PER_EPOCH),
    slotInEpoch: relativeSlot % SLOTS_PER_EPOCH,
  };
}

export function coordsToRelativeSlot(epochInPeriod: number, slotInEpoch: number): number {
  return epochInPeriod * SLOTS_PER_EPOCH + slotInEpoch;
}

/** Unix-ms timestamp of a relative slot within a period. */
export function slotTimestampMs(period: number, relativeSlot: number): number {
  const absoluteSlot = periodStartSlot(period) + relativeSlot;
  return (GENESIS_TIME + absoluteSlot * SECONDS_PER_SLOT) * 1000;
}

// ---- deterministic selection model (demo) --------------------------------

/** 32-bit FNV-1a hash of a string → unsigned int. */
function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Deterministic RANDAO-like beacon string for a period (demo). */
export function randomBeaconForPeriod(period: number): string {
  return `randao:${fnv1a(`beacon-${period}`).toString(16)}`;
}

/**
 * Models `get_selection_proof`: a deterministic value in [0, 1) for a
 * (validator, period, beacon) tuple. Real selection uses a BLS signature over
 * the period's domain; this stand-in is stable and uniformly distributed.
 */
export function getSelectionProof(validatorIndex: number, period: number, randomBeacon: string): number {
  return fnv1a(`${randomBeacon}|${validatorIndex}|${period}`) / 0x1_0000_0000;
}

/**
 * Whether a validator is in the sync committee for a period under the demo
 * model. `selectionThreshold` is the acceptance probability; the demo uses a
 * high value so a typical operator sees several assigned periods in their
 * recent history. Production membership comes from the beacon API instead.
 */
export function isInSyncCommittee(
  validatorIndex: number,
  period: number,
  selectionThreshold = 0.5,
): boolean {
  return getSelectionProof(validatorIndex, period, randomBeaconForPeriod(period)) < selectionThreshold;
}

/**
 * Deterministic per-slot participation bit for an assigned validator (demo).
 * Returns 1 (participated) with high probability, occasionally 0 (missed).
 */
export function participationBit(validatorIndex: number, period: number, relativeSlot: number): 0 | 1 {
  const r = fnv1a(`part|${validatorIndex}|${period}|${relativeSlot}`) / 0x1_0000_0000;
  return r < 0.02 ? 0 : 1; // ≈98% participation
}

/**
 * Find the next period (strictly after `fromPeriod`) in which the validator is
 * assigned, scanning at most `lookahead` periods. Returns null if none found.
 */
export function findNextAssignedPeriod(
  validatorIndex: number,
  fromPeriod: number,
  selectionThreshold = 0.5,
  lookahead = 64,
): number | null {
  for (let p = fromPeriod + 1; p <= fromPeriod + lookahead; p++) {
    if (isInSyncCommittee(validatorIndex, p, selectionThreshold)) return p;
  }
  return null;
}

/** Aggregate participation rate (0..1) over a participated/total pair. */
export function computeParticipationRate(participated: number, total: number): number {
  return total > 0 ? participated / total : 0;
}
