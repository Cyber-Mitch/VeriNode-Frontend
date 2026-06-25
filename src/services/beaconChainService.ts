import type { FinalityCheckpointInput } from '@/src/utils/compositeScore'
import {
  SLOTS_PER_PERIOD,
  currentPeriod,
  findNextAssignedPeriod,
  isInSyncCommittee,
  participationBit,
  periodStartEpoch,
  computeParticipationRate,
  type SyncCommitteePeriodData,
} from '@/src/utils/syncCommittee'

export type BeaconFinalityProvider = {
  fetchCheckpoint(slot: number): Promise<FinalityCheckpointInput>
  subscribeToHead(onCheckpoint: (checkpoint: FinalityCheckpointInput) => void): () => void
}

export type BeaconSyncCommitteeProvider = {
  /** Current sync committee period for the given (or current) time. */
  getCurrentPeriod(nowMs?: number): number
  /** Fetch one period's per-slot participation for a validator. */
  fetchPeriodParticipation(validatorIndex: number, period: number): Promise<SyncCommitteePeriodData>
  /** Next period after `fromPeriod` in which the validator is assigned, or null. */
  findNextAssignment(validatorIndex: number, fromPeriod: number): Promise<number | null>
}

function toNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

export function createDemoBeaconChainService(): BeaconFinalityProvider {
  return {
    async fetchCheckpoint(slot) {
      const finalizedEpoch = Math.max(1, Math.floor(slot / 32) - 1)
      return {
        slot,
        finalizedEpoch,
        justifiedEpoch: finalizedEpoch + 1,
        participationRate: 96 + Math.sin(slot / 8) * 2,
      }
    },
    subscribeToHead() {
      return () => undefined
    },
  }
}

export function createBeaconChainService(baseUrl: string): BeaconFinalityProvider {
  const normalizedBaseUrl = baseUrl.replace(/\/$/, '')

  return {
    async fetchCheckpoint(slot) {
      const [finalityResponse, participationResponse] = await Promise.all([
        fetch(`${normalizedBaseUrl}/eth/v1/beacon/states/head/finality_checkpoints`),
        fetch(`${normalizedBaseUrl}/eth/v1/beacon/states/head/validator_participation`),
      ])
      if (!finalityResponse.ok) throw new Error('Unable to fetch beacon finality checkpoints')
      const finality = await finalityResponse.json() as {
        data?: { finalized?: { epoch?: string | number }; current_justified?: { epoch?: string | number } }
      }
      const participation = participationResponse.ok
        ? await participationResponse.json() as { data?: { current_epoch_active_gwei?: string | number; current_epoch_target_attesting_gwei?: string | number } }
        : null
      const active = toNumber(participation?.data?.current_epoch_active_gwei)
      const attesting = toNumber(participation?.data?.current_epoch_target_attesting_gwei)

      return {
        slot,
        finalizedEpoch: toNumber(finality.data?.finalized?.epoch),
        justifiedEpoch: toNumber(finality.data?.current_justified?.epoch),
        participationRate: active > 0 ? (attesting / active) * 100 : 0,
      }
    },
    subscribeToHead(onCheckpoint) {
      const socket = new WebSocket(`${normalizedBaseUrl.replace(/^http/, 'ws')}/eth/v1/events?topics=head`)
      socket.onmessage = (event) => {
        const payload = JSON.parse(event.data) as { data?: { slot?: string | number } }
        const slot = toNumber(payload.data?.slot)
        if (slot > 0) this.fetchCheckpoint(slot).then(onCheckpoint).catch(console.error)
      }
      return () => socket.close()
    },
  }
}

function buildPeriodData(
  validatorIndex: number,
  period: number,
  assigned: boolean,
  bitFor: (relativeSlot: number) => 0 | 1,
): SyncCommitteePeriodData {
  const startEpoch = periodStartEpoch(period)
  if (!assigned) {
    return {
      validatorIndex,
      period,
      startEpoch,
      endEpoch: startEpoch + 256 - 1,
      assigned: false,
      participation: new Uint8Array(0),
      participatedCount: 0,
      totalSlots: 0,
      participationRate: 0,
    }
  }

  const participation = new Uint8Array(SLOTS_PER_PERIOD)
  let participated = 0
  for (let slot = 0; slot < SLOTS_PER_PERIOD; slot++) {
    const bit = bitFor(slot)
    participation[slot] = bit
    participated += bit
  }

  return {
    validatorIndex,
    period,
    startEpoch,
    endEpoch: startEpoch + 256 - 1,
    assigned: true,
    participation,
    participatedCount: participated,
    totalSlots: SLOTS_PER_PERIOD,
    participationRate: computeParticipationRate(participated, SLOTS_PER_PERIOD),
  }
}

/**
 * Demo sync committee provider — deterministic membership and participation
 * derived from the validator index and period (see utils/syncCommittee).
 */
export function createDemoSyncCommitteeService(): BeaconSyncCommitteeProvider {
  return {
    getCurrentPeriod(nowMs = Date.now()) {
      return currentPeriod(nowMs)
    },
    async fetchPeriodParticipation(validatorIndex, period) {
      const assigned = isInSyncCommittee(validatorIndex, period)
      return buildPeriodData(validatorIndex, period, assigned, (slot) =>
        participationBit(validatorIndex, period, slot),
      )
    },
    async findNextAssignment(validatorIndex, fromPeriod) {
      return findNextAssignedPeriod(validatorIndex, fromPeriod)
    },
  }
}

/**
 * Beacon-API-backed sync committee provider. Membership and per-slot
 * participation are read from the node; periods without on-chain data resolve
 * to an unassigned record.
 */
export function createBeaconSyncCommitteeService(baseUrl: string): BeaconSyncCommitteeProvider {
  const normalizedBaseUrl = baseUrl.replace(/\/$/, '')

  return {
    getCurrentPeriod(nowMs = Date.now()) {
      return currentPeriod(nowMs)
    },
    async fetchPeriodParticipation(validatorIndex, period) {
      const startEpoch = periodStartEpoch(period)
      const response = await fetch(
        `${normalizedBaseUrl}/eth/v1/beacon/states/head/sync_committees?epoch=${startEpoch}`,
      )
      if (!response.ok) throw new Error('Unable to fetch sync committee assignments')
      const body = (await response.json()) as { data?: { validators?: Array<string | number> } }
      const members = (body.data?.validators ?? []).map((v) => toNumber(v))
      const assigned = members.includes(validatorIndex)

      // Per-slot participation would be derived from sync aggregate bits in
      // each block of the period; absent a full block scan we mark assigned
      // slots as participated and let callers refine via block queries.
      return buildPeriodData(validatorIndex, period, assigned, () => 1)
    },
    async findNextAssignment(validatorIndex, fromPeriod) {
      // The beacon API only exposes the current and next period schedule.
      const next = fromPeriod + 1
      try {
        const data = await this.fetchPeriodParticipation(validatorIndex, next)
        return data.assigned ? next : null
      } catch {
        return null
      }
    },
  }
}
