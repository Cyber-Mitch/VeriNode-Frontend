// Staking service — source of validator balance samples for reconciliation.
//
// Provides a deterministic demo generator (forward-simulated rewards,
// penalties, and partial-withdrawal sweeps) and a beacon-API-backed factory.
// Amounts are bigint gwei.

import type { ValidatorBalanceSample } from '@/src/types/validator'
import { EFFECTIVE_BALANCE_CAP_GWEI, excessOverCap } from '@/src/utils/balanceMath'

const SLOTS_PER_EPOCH = 32
const SECONDS_PER_SLOT = 12
const GENESIS_TIME = 1_606_824_023
const EPOCH_SECONDS = SLOTS_PER_EPOCH * SECONDS_PER_SLOT
const SWEEP_PERIOD_EPOCHS = 225 // ~daily partial-withdrawal sweep

export type StakingProvider = {
  fetchSamples(validatorIndex: number, count: number): Promise<ValidatorBalanceSample[]>
}

function fnv01(input: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0) / 0x1_0000_0000
}

function epochTimestampMs(epoch: number): number {
  return (GENESIS_TIME + epoch * EPOCH_SECONDS) * 1000
}

function currentEpoch(nowMs: number): number {
  return Math.max(0, Math.floor((nowMs / 1000 - GENESIS_TIME) / EPOCH_SECONDS))
}

/**
 * Forward-simulate `count` epoch-boundary samples for a validator. Even
 * indices start above the cap (so they show as capped with a sweep stream);
 * odd indices hover just below it.
 */
export function generateDemoSamples(
  validatorIndex: number,
  count: number,
  options: { endEpoch?: number; nowMs?: number } = {},
): ValidatorBalanceSample[] {
  const nowMs = options.nowMs ?? Date.now()
  const endEpoch = options.endEpoch ?? currentEpoch(nowMs)
  const startEpoch = Math.max(0, endEpoch - count + 1)

  const capped = validatorIndex % 2 === 0
  const initialExcess = capped
    ? BigInt(Math.round((1.5 + fnv01(`excess:${validatorIndex}`) * 2) * 1e9)) // 1.5–3.5 ETH over cap
    : BigInt(0) - BigInt(Math.round((0.2 + fnv01(`gap:${validatorIndex}`) * 0.4) * 1e9)) // 0.2–0.6 ETH under

  let actual = EFFECTIVE_BALANCE_CAP_GWEI + initialExcess
  const sweepPhase = Math.floor(fnv01(`phase:${validatorIndex}`) * SWEEP_PERIOD_EPOCHS)

  const samples: ValidatorBalanceSample[] = new Array(endEpoch - startEpoch + 1)
  for (let i = 0, epoch = startEpoch; epoch <= endEpoch; epoch++, i++) {
    const reward = 11_000 + Math.floor(fnv01(`r:${validatorIndex}:${epoch}`) * 9_000) // gwei
    const missed = fnv01(`m:${validatorIndex}:${epoch}`) < 0.04
    const penalty = missed ? 2_000 + Math.floor(fnv01(`p:${validatorIndex}:${epoch}`) * 3_000) : 0
    actual += BigInt(reward - penalty)

    // Partial-withdrawal sweep: skim the excess above the cap on the sweep epoch.
    let withdrawal = BigInt(0)
    const excess = excessOverCap(actual)
    if (excess > BigInt(0) && epoch % SWEEP_PERIOD_EPOCHS === sweepPhase) {
      // Sweep most of the excess, leaving a little so the validator stays capped.
      withdrawal = (excess * BigInt(85)) / BigInt(100)
      actual -= withdrawal
    }

    samples[i] = {
      validatorIndex,
      epoch,
      timestamp: epochTimestampMs(epoch),
      actualBalanceGwei: actual,
      withdrawalGwei: withdrawal,
    }
  }
  return samples
}

export function createDemoStakingService(): StakingProvider {
  return {
    async fetchSamples(validatorIndex, count) {
      return generateDemoSamples(validatorIndex, count)
    },
  }
}

/**
 * Beacon-API-backed provider. Reads the current validator balance; full
 * historical decomposition requires a per-epoch state/withdrawal scan, so this
 * returns a single current sample (callers fall back to the demo stream for
 * history when no node is configured).
 */
export function createStakingService(baseUrl: string): StakingProvider {
  const normalizedBaseUrl = baseUrl.replace(/\/$/, '')
  return {
    async fetchSamples(validatorIndex) {
      const response = await fetch(
        `${normalizedBaseUrl}/eth/v1/beacon/states/head/validator_balances?id=${validatorIndex}`,
      )
      if (!response.ok) throw new Error('Unable to fetch validator balances')
      const body = (await response.json()) as { data?: Array<{ balance?: string | number }> }
      const balance = body.data?.[0]?.balance
      const actualBalanceGwei = balance === undefined ? EFFECTIVE_BALANCE_CAP_GWEI : BigInt(balance)
      const epoch = currentEpoch(Date.now())
      return [
        {
          validatorIndex,
          epoch,
          timestamp: epochTimestampMs(epoch),
          actualBalanceGwei,
          withdrawalGwei: BigInt(0),
        },
      ]
    },
  }
}
