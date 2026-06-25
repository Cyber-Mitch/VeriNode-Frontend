import { describe, it, expect } from 'vitest'
import { nativeToScVal } from '@stellar/stellar-sdk'
import { decodeLedgerEvent } from '@/src/utils/hexDecoder'
import type { LedgerEvent } from '@/src/types/ledgerEvents'

/**
 * Encode a contract log event the same way the on-chain emitter would, using
 * the real @stellar/stellar-sdk SCVal serialization the decoder consumes:
 *   topic[0] = symbol signature, topic[1] = subject, body = SCMap of fields.
 */
function encodeEvent(
  signature: string,
  subject: string,
  body: Record<string, unknown> = {},
): { topics: string[]; body: string } {
  const topics = [
    nativeToScVal(signature, { type: 'symbol' }).toXDR('hex'),
    nativeToScVal(subject).toXDR('hex'),
  ]
  return { topics, body: nativeToScVal(body).toXDR('base64') }
}

const NODE = 'GNODE000000000000000000000000000000000000000000000000000'

describe('decodeLedgerEvent — known event types', () => {
  it('decodes approve_attestation with the correct title and fields', () => {
    const { topics, body } = encodeEvent('approve_attestation', NODE, {
      attestation_id: 'att-123',
      epoch: 42,
    })
    const ev = decodeLedgerEvent(topics, body)
    expect(ev.type).toBe('approve_attestation')
    expect(ev.title).toBe('Attestation Approved')
    expect(ev.severity).toBe('success')
    if (ev.type === 'approve_attestation') {
      expect(ev.nodeId).toBe(NODE)
      expect(ev.attestationId).toBe('att-123')
      expect(ev.epoch).toBe(42)
    }
  })

  it('decodes reject_attestation as a high-severity error', () => {
    const { topics, body } = encodeEvent('reject_attestation', NODE, {
      attestation_id: 'att-9',
      reason: 'stale signature',
    })
    const ev = decodeLedgerEvent(topics, body)
    expect(ev.title).toBe('Attestation Rejected')
    expect(ev.severity).toBe('error')
    expect(ev.highSeverity).toBe(true)
    if (ev.type === 'reject_attestation') {
      expect(ev.reason).toBe('stale signature')
    }
  })

  it('decodes slash_node with amount and reason, marked high severity', () => {
    const { topics, body } = encodeEvent('slash_node', NODE, {
      amount: '5000',
      reason: 'double_sign',
    })
    const ev = decodeLedgerEvent(topics, body)
    expect(ev.title).toBe('Node Slashed')
    expect(ev.severity).toBe('error')
    expect(ev.highSeverity).toBe(true)
    if (ev.type === 'slash_node') {
      expect(ev.amount).toBe('5000')
      expect(ev.reason).toBe('double_sign')
    }
  })

  it('decodes reward_distributed as a success event', () => {
    const { topics, body } = encodeEvent('reward_distributed', NODE, {
      amount: '120',
      epoch: 7,
    })
    const ev = decodeLedgerEvent(topics, body)
    expect(ev.title).toBe('Reward Distributed')
    expect(ev.severity).toBe('success')
    expect(ev.highSeverity).toBe(false)
    if (ev.type === 'reward_distributed') {
      expect(ev.amount).toBe('120')
      expect(ev.epoch).toBe(7)
    }
  })

  it('decodes node_registered and node_deregistered', () => {
    const reg = decodeLedgerEvent(
      ...Object.values(encodeEvent('node_registered', NODE, { operator: 'GOPERATOR' })) as [string[], string],
    )
    expect(reg.title).toBe('Node Registered')
    expect(reg.severity).toBe('success')
    if (reg.type === 'node_registered') expect(reg.operator).toBe('GOPERATOR')

    const dereg = decodeLedgerEvent(
      ...Object.values(encodeEvent('node_deregistered', NODE, { reason: 'voluntary' })) as [string[], string],
    )
    expect(dereg.title).toBe('Node Deregistered')
    expect(dereg.severity).toBe('warning')
    if (dereg.type === 'node_deregistered') expect(dereg.reason).toBe('voluntary')
  })

  it('decodes parameter_changed with old/new values', () => {
    const { topics, body } = encodeEvent('parameter_changed', 'min_stake', {
      old_value: '100',
      new_value: '250',
    })
    const ev = decodeLedgerEvent(topics, body)
    expect(ev.title).toBe('Parameter Changed')
    expect(ev.severity).toBe('warning')
    if (ev.type === 'parameter_changed') {
      expect(ev.key).toBe('min_stake')
      expect(ev.oldValue).toBe('100')
      expect(ev.newValue).toBe('250')
    }
  })

  it('honors envelope metadata (id, timestamp, ledgerSeq)', () => {
    const { topics, body } = encodeEvent('slash_node', NODE, { amount: '1', reason: 'x' })
    const ev = decodeLedgerEvent(topics, body, { id: 'tx-abc/0', timestamp: 1234, ledgerSeq: 99 })
    expect(ev.id).toBe('tx-abc/0')
    expect(ev.timestamp).toBe(1234)
    expect(ev.ledgerSeq).toBe(99)
  })
})

describe('decodeLedgerEvent — unknown / malformed input', () => {
  it('returns an UnknownEvent for an unrecognized signature without throwing', () => {
    const { topics, body } = encodeEvent('teleport_node', NODE, { foo: 'bar' })
    let ev!: LedgerEvent
    expect(() => {
      ev = decodeLedgerEvent(topics, body)
    }).not.toThrow()
    expect(ev.type).toBe('unknown')
    expect(ev.title).toBe('Unknown Event')
    expect(ev.severity).toBe('info')
    if (ev.type === 'unknown') expect(ev.signature).toBe('teleport_node')
  })

  it('returns an UnknownEvent (signature null) for non-XDR garbage hex', () => {
    const ev = decodeLedgerEvent(['zzzznothex'], 'not-base64-@@@')
    expect(ev.type).toBe('unknown')
    if (ev.type === 'unknown') expect(ev.signature).toBeNull()
  })

  it('handles empty topics gracefully', () => {
    const ev = decodeLedgerEvent([], '')
    expect(ev.type).toBe('unknown')
  })
})

describe('decodeLedgerEvent — performance', () => {
  it('decodes 1,000 events in under 100ms', () => {
    const signatures = [
      'approve_attestation',
      'reject_attestation',
      'slash_node',
      'reward_distributed',
      'node_registered',
      'node_deregistered',
      'parameter_changed',
    ]
    // Pre-encode so we measure decode cost only.
    const encoded = Array.from({ length: 1000 }, (_, i) => {
      const sig = signatures[i % signatures.length]
      return encodeEvent(sig, NODE, { amount: String(i), reason: 'r', attestation_id: `a${i}`, epoch: i })
    })

    const start = performance.now()
    for (let i = 0; i < encoded.length; i++) {
      decodeLedgerEvent(encoded[i].topics, encoded[i].body, { id: `e${i}` })
    }
    const elapsed = performance.now() - start

    expect(encoded).toHaveLength(1000)
    expect(elapsed).toBeLessThan(100)
  })
})
