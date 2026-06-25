'use client'

import { useMemo } from 'react'
import type { ExitQueueReading, NetworkQueueSnapshot } from '@/src/types/exitQueue'
import { currentEpoch, epochStartMs } from '@/src/utils/epochTime'

// Network churn parameters (validator-count exit churn).
const ACTIVE_VALIDATORS = 900_000
const CHURN_LIMIT_QUOTIENT = 65_536
const MIN_PER_EPOCH_CHURN_LIMIT = 4
const SLASHING_DELAY_EPOCHS = 4

function churnLimit(): number {
  return Math.max(MIN_PER_EPOCH_CHURN_LIMIT, Math.floor(ACTIVE_VALIDATORS / CHURN_LIMIT_QUOTIENT))
}

function fnv01(input: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0) / 0x1_0000_0000
}

export interface BeaconRPC {
  /** Exit-queue reading for one validator at a given epoch. */
  getValidatorQueue: (validatorIndex: number, epoch: number) => Promise<ExitQueueReading>
  /** Raw validator balances (gwei) by index. */
  getValidatorBalances: (ids: number[]) => Promise<Record<number, bigint>>
}

/**
 * Deterministic demo RPC. Models a mass-slashing event ~25 epochs before the
 * service was created, after which the queue drains at the churn limit.
 */
function createDemoBeaconRPC(): BeaconRPC {
  const churn = churnLimit()
  const anchorEpoch = currentEpoch(Date.now())
  const slashEpoch = anchorEpoch - 25
  const baseline = 180
  const spike = 12_000

  const depthAt = (epoch: number): number => {
    const noise = Math.floor(fnv01(`d:${epoch}`) * 40)
    if (epoch < slashEpoch) return baseline + noise
    const drained = churn * (epoch - slashEpoch)
    return Math.max(baseline, baseline + spike - drained) + noise
  }

  return {
    async getValidatorQueue(validatorIndex, epoch) {
      const slashed = validatorIndex % 2 === 0
      const entryEpoch = slashEpoch + (slashed ? SLASHING_DELAY_EPOCHS : 0)
      const initialAhead = 800 + (validatorIndex % 4000)
      const positionOffset =
        epoch < entryEpoch
          ? initialAhead
          : Math.max(0, initialAhead - churn * (epoch - entryEpoch))

      const network: NetworkQueueSnapshot = {
        epoch,
        timestamp: epochStartMs(epoch),
        queueDepth: depthAt(epoch),
        churnLimit: churn,
        voluntaryExits: Math.floor(fnv01(`v:${epoch}`) * 4),
        slashedExits: epoch === slashEpoch ? spike : Math.floor(fnv01(`s:${epoch}`) * 2),
      }

      return { network, position: { validatorIndex, epoch, positionOffset, slashed } }
    },

    async getValidatorBalances(ids) {
      const out: Record<number, bigint> = {}
      for (const id of ids) out[id] = BigInt(32) * BigInt(1_000_000_000)
      return out
    },
  }
}

/** Beacon-API-backed RPC. */
function createHttpBeaconRPC(baseUrl: string): BeaconRPC {
  const normalizedBaseUrl = baseUrl.replace(/\/$/, '')
  const churn = churnLimit()

  return {
    async getValidatorQueue(validatorIndex, epoch) {
      const response = await fetch(
        `${normalizedBaseUrl}/eth/v1/beacon/states/head/validators/${validatorIndex}`,
      )
      if (!response.ok) throw new Error('Unable to fetch validator state')
      const body = (await response.json()) as {
        data?: { validator?: { exit_epoch?: string | number; slashed?: boolean } }
      }
      const exitEpoch = Number(body.data?.validator?.exit_epoch ?? epoch)
      const slashed = Boolean(body.data?.validator?.slashed)
      // Approximate position from the assigned exit epoch and churn limit.
      const positionOffset = Math.max(0, (exitEpoch - epoch) * churn)

      const network: NetworkQueueSnapshot = {
        epoch,
        timestamp: epochStartMs(epoch),
        queueDepth: positionOffset,
        churnLimit: churn,
        voluntaryExits: 0,
        slashedExits: 0,
      }
      return { network, position: { validatorIndex, epoch, positionOffset, slashed } }
    },

    async getValidatorBalances(ids) {
      const query = ids.join(',')
      const response = await fetch(
        `${normalizedBaseUrl}/eth/v1/beacon/states/head/validator_balances?id=${query}`,
      )
      if (!response.ok) throw new Error('Unable to fetch validator balances')
      const body = (await response.json()) as {
        data?: Array<{ index?: string | number; balance?: string | number }>
      }
      const out: Record<number, bigint> = {}
      for (const entry of body.data ?? []) {
        if (entry.index !== undefined && entry.balance !== undefined) {
          out[Number(entry.index)] = BigInt(entry.balance)
        }
      }
      return out
    },
  }
}

/** Beacon JSON-RPC client hook (demo when no node URL is supplied). */
export function useBeaconRPC(beaconNodeUrl?: string): BeaconRPC {
  return useMemo(
    () => (beaconNodeUrl ? createHttpBeaconRPC(beaconNodeUrl) : createDemoBeaconRPC()),
    [beaconNodeUrl],
  )
}
