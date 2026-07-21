// Effective-balance reconciliation engine.
//
// The displayed effective balance drifts from the actual balance because
// effective balance is capped (min(actual, cap)) and updates only at epoch
// boundaries, while actual balance moves every epoch from rewards, penalties,
// and partial-withdrawal sweeps. This engine decomposes each epoch's actual-
// balance delta into those three components.
//
// Decomposition (vs the previous sample):
//   net_delta   = actual_n - actual_{n-1}
//   gross_delta = net_delta + withdrawal_n   (add back what was swept out)
//   rewards     = max(0, gross_delta)        consensus-layer income
//   penalties   = max(0, -gross_delta)       missed-duty / slashing losses
//   withdrawal  = withdrawal_n               partial-withdrawal credit

import type {
  ReconciliationRecord,
  ReconciliationSummary,
  ValidatorBalanceSample,
} from '@/src/types/validator'
import { EFFECTIVE_BALANCE_CAP_GWEI, effectiveBalance, isCapped } from '@/src/utils/balanceMath'

const ZERO = BigInt(0)

/**
 * Reconcile a single sample against the previous one. With no previous sample
 * the record is a baseline (no decomposed delta beyond the current withdrawal).
 */
export function reconcile(
  prev: ValidatorBalanceSample | null,
  current: ValidatorBalanceSample,
  cap = EFFECTIVE_BALANCE_CAP_GWEI,
): ReconciliationRecord {
  const effective = effectiveBalance(current.actualBalanceGwei, cap)
  const capped = isCapped(current.actualBalanceGwei, cap)

  if (!prev) {
    return {
      validatorIndex: current.validatorIndex,
      epoch: current.epoch,
      timestamp: current.timestamp,
      actualBalanceGwei: current.actualBalanceGwei,
      effectiveBalanceGwei: effective,
      netDeltaGwei: ZERO,
      rewardsGwei: ZERO,
      penaltiesGwei: ZERO,
      withdrawalCreditsGwei: current.withdrawalGwei,
      capped,
    }
  }

  const netDelta = current.actualBalanceGwei - prev.actualBalanceGwei
  const grossDelta = netDelta + current.withdrawalGwei
  const rewards = grossDelta > ZERO ? grossDelta : ZERO
  const penalties = grossDelta < ZERO ? -grossDelta : ZERO

  return {
    validatorIndex: current.validatorIndex,
    epoch: current.epoch,
    timestamp: current.timestamp,
    actualBalanceGwei: current.actualBalanceGwei,
    effectiveBalanceGwei: effective,
    netDeltaGwei: netDelta,
    rewardsGwei: rewards,
    penaltiesGwei: penalties,
    withdrawalCreditsGwei: current.withdrawalGwei,
    capped,
  }
}

/**
 * Reconcile an ordered series of samples into per-epoch records. Input is
 * sorted ascending by epoch defensively; duplicate epochs keep the last.
 */
export function reconcileSeries(
  samples: ValidatorBalanceSample[],
  cap = EFFECTIVE_BALANCE_CAP_GWEI,
): ReconciliationRecord[] {
  if (samples.length === 0) return []

  const sorted = [...samples].sort((a, b) => a.epoch - b.epoch)
  const deduped: ValidatorBalanceSample[] = []
  for (const sample of sorted) {
    const last = deduped[deduped.length - 1]
    if (last && last.epoch === sample.epoch) deduped[deduped.length - 1] = sample
    else deduped.push(sample)
  }

  const records: ReconciliationRecord[] = new Array(deduped.length)
  let prev: ValidatorBalanceSample | null = null
  for (let i = 0; i < deduped.length; i++) {
    records[i] = reconcile(prev, deduped[i], cap)
    prev = deduped[i]
  }
  return records
}

/** Aggregate a set of records into a per-validator summary. */
export function summarize(
  validatorIndex: number,
  records: ReconciliationRecord[],
): ReconciliationSummary {
  let totalRewards = ZERO
  let totalPenalties = ZERO
  let totalWithdrawals = ZERO
  for (const r of records) {
    totalRewards += r.rewardsGwei
    totalPenalties += r.penaltiesGwei
    totalWithdrawals += r.withdrawalCreditsGwei
  }
  return {
    validatorIndex,
    latest: records.length ? records[records.length - 1] : null,
    totalRewardsGwei: totalRewards,
    totalPenaltiesGwei: totalPenalties,
    totalWithdrawalsGwei: totalWithdrawals,
    recordCount: records.length,
  }
}
