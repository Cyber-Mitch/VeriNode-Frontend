'use client'

import { useMemo } from 'react'
import { useLedgerEvents } from '@/src/hooks/useLedgerEvents'
import { decodeLedgerEvent } from '@/src/utils/hexDecoder'
import type { LedgerEvent, RawLedgerEvent } from '@/src/types/ledgerEvents'

// Per-event decode cache keyed by raw-event identity (1:1 with its eventId).
// A WeakMap means entries are reclaimed automatically once a raw event ages out
// of the source buffer and is garbage-collected — no manual eviction, and no
// ref read during render.
const decodeCache = new WeakMap<RawLedgerEvent, LedgerEvent>()

function decodeOnce(raw: RawLedgerEvent): LedgerEvent {
  const cached = decodeCache.get(raw)
  if (cached) return cached
  const event = decodeLedgerEvent(raw.topics, raw.body, {
    id: raw.id,
    timestamp: raw.timestamp,
    ledgerSeq: raw.ledgerSeq,
  })
  decodeCache.set(raw, event)
  return event
}

/**
 * Wraps {@link useLedgerEvents} and decodes each raw event into a typed
 * `LedgerEvent`. Each raw event is decoded at most once (memoized by identity),
 * keeping the hot path well inside the per-event latency budget even as the
 * buffer churns.
 */
export function useDecodedLedgerEvents(
  options: Parameters<typeof useLedgerEvents>[0] = {},
): {
  events: LedgerEvent[]
  connected: boolean
  error: string | null
  push: (event: RawLedgerEvent) => void
  clear: () => void
} {
  const { events: rawEvents, connected, error, push, clear } = useLedgerEvents(options)

  const events = useMemo(() => rawEvents.map(decodeOnce), [rawEvents])

  return { events, connected, error, push, clear }
}
