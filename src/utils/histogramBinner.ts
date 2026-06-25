// Attestation inclusion delay binning.
//
// Inclusion delay is the number of slots between a validator's attestation
// duty and the slot in which the attestation was actually included on chain:
//
//   delay = inclusion_slot - (attestation_epoch_start_slot + attester_slot_offset)
//
// A delay of 1 is optimal (included in the very next slot). Missed rewards
// grow ~1% per slot of additional delay, so the distribution across epochs is
// a key validator-effectiveness signal. Delays are bucketed by slot into 33
// buckets (0..32 inclusive).

export const SLOTS_PER_EPOCH = 32
export const MAX_DELAY = 32
export const BUCKET_COUNT = MAX_DELAY + 1 // 33 buckets, indices 0..32

/** A single attestation inclusion observation for one validator. */
export interface AttestationInclusion {
  epoch: number
  /** Absolute slot the attestation was included in. */
  inclusionSlot: number
  /** The validator's assigned slot offset within the epoch (0..31). */
  attesterSlotOffset: number
}

/** Binned inclusion-delay distribution with pre-computed percentages. */
export interface DelayHistogram {
  /** Per-bucket attestation counts; length BUCKET_COUNT. */
  counts: number[]
  /** Total attestations counted. */
  total: number
  /** Per-bucket share of total, in percent (0..100). */
  percentages: number[]
  /** Cumulative percentage up to and including each bucket. */
  cumulative: number[]
  /** Highest single-bucket count (for y-axis scaling). */
  maxCount: number
  /** Mean inclusion delay across all counted attestations. */
  meanDelay: number
}

/** Compute the inclusion delay for one record, clamped to [0, MAX_DELAY]. */
export function computeDelay(record: AttestationInclusion): number {
  const epochStartSlot = record.epoch * SLOTS_PER_EPOCH
  const delay = record.inclusionSlot - (epochStartSlot + record.attesterSlotOffset)
  if (delay < 0) return 0
  if (delay > MAX_DELAY) return MAX_DELAY
  return delay
}

function emptyHistogram(): DelayHistogram {
  return {
    counts: new Array(BUCKET_COUNT).fill(0),
    total: 0,
    percentages: new Array(BUCKET_COUNT).fill(0),
    cumulative: new Array(BUCKET_COUNT).fill(0),
    maxCount: 0,
    meanDelay: 0,
  }
}

/** Bin an array of already-computed delay values (each expected in [0, 32]). */
export function binDelays(delays: ArrayLike<number>): DelayHistogram {
  if (delays.length === 0) return emptyHistogram()

  const counts = new Array(BUCKET_COUNT).fill(0)
  let total = 0
  let delaySum = 0

  for (let i = 0; i < delays.length; i++) {
    let d = delays[i]
    if (d < 0) d = 0
    else if (d > MAX_DELAY) d = MAX_DELAY
    counts[d]++
    total++
    delaySum += d
  }

  const percentages = new Array(BUCKET_COUNT).fill(0)
  const cumulative = new Array(BUCKET_COUNT).fill(0)
  let maxCount = 0
  let running = 0
  for (let b = 0; b < BUCKET_COUNT; b++) {
    const pct = total > 0 ? (counts[b] / total) * 100 : 0
    percentages[b] = pct
    running += pct
    cumulative[b] = running
    if (counts[b] > maxCount) maxCount = counts[b]
  }

  return {
    counts,
    total,
    percentages,
    cumulative,
    maxCount,
    meanDelay: total > 0 ? delaySum / total : 0,
  }
}

/**
 * Bin inclusion records whose epoch falls within [fromEpoch, toEpoch]
 * (inclusive), computing each record's delay on the fly.
 */
export function binInclusions(
  records: ArrayLike<AttestationInclusion>,
  fromEpoch: number,
  toEpoch: number,
): DelayHistogram {
  const delays: number[] = []
  for (let i = 0; i < records.length; i++) {
    const r = records[i]
    if (r.epoch >= fromEpoch && r.epoch <= toEpoch) delays.push(computeDelay(r))
  }
  return binDelays(delays)
}

// ---- worker message protocol --------------------------------------------

export type HistogramWorkerRequest = {
  type: 'COMPUTE'
  payload: { requestId: string; delays: Float64Array }
}

export type HistogramWorkerResponse =
  | { type: 'RESULT'; payload: { requestId: string; histogram: DelayHistogram } }
  | { type: 'ERROR'; payload: { requestId: string; message: string } }
