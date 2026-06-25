// Epoch boundary timing utilities.
//
// Beacon epochs are 32 slots × 12 s = 384 s (~6.4 min). Exit-queue polling is
// aligned to epoch boundaries to avoid hammering the beacon node.

export const SLOTS_PER_EPOCH = 32
export const SECONDS_PER_SLOT = 12
export const GENESIS_TIME = 1_606_824_023 // mainnet, unix seconds
export const EPOCH_SECONDS = SLOTS_PER_EPOCH * SECONDS_PER_SLOT
export const EPOCH_MS = EPOCH_SECONDS * 1000

/** Epoch containing the given wall-clock time. */
export function currentEpoch(nowMs: number): number {
  return Math.max(0, Math.floor((nowMs / 1000 - GENESIS_TIME) / EPOCH_SECONDS))
}

/** Unix-ms timestamp of an epoch's first slot. */
export function epochStartMs(epoch: number): number {
  return (GENESIS_TIME + epoch * EPOCH_SECONDS) * 1000
}

/** Wall-clock time of the next epoch boundary after `nowMs`. */
export function nextEpochBoundaryMs(nowMs: number): number {
  return epochStartMs(currentEpoch(nowMs) + 1)
}

/** Milliseconds remaining until the next epoch boundary (>= 0). */
export function msUntilNextEpoch(nowMs: number): number {
  return Math.max(0, nextEpochBoundaryMs(nowMs) - nowMs)
}

/** Convert a number of epochs to milliseconds. */
export function epochsToMs(epochs: number): number {
  return epochs * EPOCH_MS
}
