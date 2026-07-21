// Decode raw Soroban contract log events into typed, human-readable alerts.
//
// Wire format (also produced by the test encoder so the two stay in lockstep):
//   topic[0] : XDR ScVal symbol  -> the event signature (e.g. "slash_node")
//   topic[1] : XDR ScVal         -> the primary subject (node id / param key)
//   body     : base64 XDR ScVal  -> an SCMap of the remaining fields
//
// `decodeLedgerEvent` is total: it never throws. Anything it can't recognize or
// parse degrades to an `UnknownEvent` so the alert pipeline stays live.

import { xdr, scValToNative } from '@stellar/stellar-sdk'
import type {
  AlertSeverity,
  KnownLedgerEventType,
  LedgerEvent,
  UnknownEvent,
} from '@/src/types/ledgerEvents'

/** Human-readable titles for each known event type. */
export const EVENT_TITLES: Record<KnownLedgerEventType, string> = {
  approve_attestation: 'Attestation Approved',
  reject_attestation: 'Attestation Rejected',
  slash_node: 'Node Slashed',
  reward_distributed: 'Reward Distributed',
  node_registered: 'Node Registered',
  node_deregistered: 'Node Deregistered',
  parameter_changed: 'Parameter Changed',
}

/** Severity (color) for each known event type. */
export const EVENT_SEVERITY: Record<KnownLedgerEventType, AlertSeverity> = {
  approve_attestation: 'success',
  reject_attestation: 'error',
  slash_node: 'error',
  reward_distributed: 'success',
  node_registered: 'success',
  node_deregistered: 'warning',
  parameter_changed: 'warning',
}

/** Events that warrant an audible alert. */
export const HIGH_SEVERITY_EVENTS: ReadonlySet<KnownLedgerEventType> = new Set([
  'slash_node',
  'reject_attestation',
])

const KNOWN_TYPES = new Set<string>(Object.keys(EVENT_TITLES))

export interface DecodeMeta {
  id?: string
  timestamp?: number
  ledgerSeq?: number
}

// ── small, allocation-free coercion helpers ──────────────────────────────────

function asString(v: unknown): string {
  if (v == null) return ''
  if (typeof v === 'string') return v
  if (typeof v === 'bigint' || typeof v === 'number' || typeof v === 'boolean') {
    return v.toString()
  }
  try {
    return JSON.stringify(v)
  } catch {
    return String(v)
  }
}

function asNumber(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v === 'bigint') return Number(v)
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  }
  return null
}

/** Decode a single hex-encoded XDR ScVal topic to its native JS value. */
function decodeTopic(hex: string): unknown {
  return scValToNative(xdr.ScVal.fromXDR(hex, 'hex'))
}

/** Decode the base64 XDR ScVal body to a plain record (empty if not a map). */
function decodeBody(base64: string): Record<string, unknown> {
  if (!base64) return {}
  const native = scValToNative(xdr.ScVal.fromXDR(base64, 'base64'))
  return native && typeof native === 'object' && !Array.isArray(native)
    ? (native as Record<string, unknown>)
    : {}
}

function fallbackId(topics: string[]): string {
  return topics[0] ? topics[0].slice(0, 32) : 'ledger-event'
}

/**
 * Decode a raw Soroban contract log event into a typed `LedgerEvent`.
 *
 * @param rawHexTopics  Hex-encoded XDR topics; topic[0] is the signature.
 * @param rawBase64Body Base64-encoded XDR SCVal body.
 * @param meta          Optional envelope metadata (id, timestamp, ledgerSeq).
 */
export function decodeLedgerEvent(
  rawHexTopics: string[],
  rawBase64Body: string,
  meta: DecodeMeta = {},
): LedgerEvent {
  const topics = Array.isArray(rawHexTopics) ? rawHexTopics : []
  const id = meta.id ?? fallbackId(topics)
  const timestamp = meta.timestamp ?? Date.now()
  const ledgerSeq = meta.ledgerSeq ?? null

  const base = {
    id,
    timestamp,
    ledgerSeq,
    rawTopics: topics,
    rawBody: rawBase64Body,
  }

  const unknown = (signature: string | null): UnknownEvent => ({
    ...base,
    type: 'unknown',
    title: 'Unknown Event',
    severity: 'info',
    highSeverity: false,
    signature,
  })

  let signature: string | null = null
  try {
    if (topics.length === 0) return unknown(null)

    const decoded = decodeTopic(topics[0])
    signature = typeof decoded === 'string' ? decoded : asString(decoded)

    if (!KNOWN_TYPES.has(signature)) {
      return unknown(signature)
    }

    const type = signature as KnownLedgerEventType
    const subject = topics.length > 1 ? asString(decodeTopic(topics[1])) : ''
    const body = decodeBody(rawBase64Body)

    const common = {
      ...base,
      title: EVENT_TITLES[type],
      severity: EVENT_SEVERITY[type],
      highSeverity: HIGH_SEVERITY_EVENTS.has(type),
    }

    switch (type) {
      case 'approve_attestation':
        return {
          ...common,
          type,
          nodeId: subject || asString(body.node_id),
          attestationId: asString(body.attestation_id),
          epoch: asNumber(body.epoch),
        }
      case 'reject_attestation':
        return {
          ...common,
          type,
          nodeId: subject || asString(body.node_id),
          attestationId: asString(body.attestation_id),
          reason: asString(body.reason),
        }
      case 'slash_node':
        return {
          ...common,
          type,
          nodeId: subject || asString(body.node_id),
          amount: asString(body.amount),
          reason: asString(body.reason),
        }
      case 'reward_distributed':
        return {
          ...common,
          type,
          nodeId: subject || asString(body.node_id),
          amount: asString(body.amount),
          epoch: asNumber(body.epoch),
        }
      case 'node_registered':
        return {
          ...common,
          type,
          nodeId: subject || asString(body.node_id),
          operator: asString(body.operator),
        }
      case 'node_deregistered':
        return {
          ...common,
          type,
          nodeId: subject || asString(body.node_id),
          reason: asString(body.reason),
        }
      case 'parameter_changed':
        return {
          ...common,
          type,
          key: subject || asString(body.key),
          oldValue: asString(body.old_value ?? body.old),
          newValue: asString(body.new_value ?? body.new),
        }
    }
  } catch {
    // Malformed XDR, unexpected SCVal shape, etc. — degrade gracefully.
    return unknown(signature)
  }

  return unknown(signature)
}
