/**
 * W3C Trace Context Propagation (#104)
 *
 * Implements the W3C Trace Context Level 1 specification:
 *   - `traceparent` header injection and extraction
 *   - `tracestate` header injection and extraction
 *
 * Spec: https://www.w3.org/TR/trace-context/
 *
 * Design goals:
 *   - Zero external dependencies.
 *   - Strict parsing — malformed headers yield `null` rather than throwing.
 *   - Immutable data structures for all parsed values.
 */

import type { TraceParent, TraceState, TraceContext, PropagationContext } from './types'

// ─── Constants ────────────────────────────────────────────────────────────────

/** Sampled flag bit within the `traceparent` flags byte. */
const FLAG_SAMPLED = 0x01

/** Maximum number of key=value pairs preserved in tracestate (per spec §3.3.1.1). */
const MAX_TRACESTATE_ENTRIES = 32

// ─── traceparent ─────────────────────────────────────────────────────────────

/**
 * Regex for a valid `traceparent` header value per W3C Trace Context spec §3.2.
 *
 * Groups:
 *   1 – version  (2 hex)
 *   2 – traceId  (32 hex)
 *   3 – parentId (16 hex)
 *   4 – flags    (2 hex)
 */
const TRACEPARENT_RE =
  /^([0-9a-f]{2})-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})(?:-.*)?$/i

/**
 * Parse a raw `traceparent` header string.
 *
 * Returns `null` for any invalid or version-`ff` header (spec §3.2.1 §3.2.2).
 */
export function parseTraceParent(raw: string): TraceParent | null {
  if (typeof raw !== 'string') return null

  const m = TRACEPARENT_RE.exec(raw.trim())
  if (!m) return null

  const version = m[1].toLowerCase()
  const traceId = m[2].toLowerCase()
  const parentId = m[3].toLowerCase()
  const flags = m[4].toLowerCase()

  // Version 'ff' is explicitly forbidden by the spec.
  if (version === 'ff') return null

  // All-zero traceId and parentId are invalid per spec §3.2.2.2 / §3.2.2.3.
  if (traceId === '00000000000000000000000000000000') return null
  if (parentId === '0000000000000000') return null

  return { version: '00', traceId, parentId, flags }
}

/**
 * Serialise a `TraceParent` into the canonical `traceparent` header value.
 */
export function serializeTraceParent(tp: TraceParent): string {
  return `${tp.version}-${tp.traceId}-${tp.parentId}-${tp.flags}`
}

/**
 * Returns `true` when the sampled flag bit is set in the flags byte.
 */
export function isSampled(flags: string): boolean {
  return (parseInt(flags, 16) & FLAG_SAMPLED) === FLAG_SAMPLED
}

/**
 * Build a `traceparent` string for a child span rooted at `parentContext`.
 */
export function buildTraceParent(context: TraceContext): string {
  const flags = context.sampled ? '01' : '00'
  return `00-${context.traceId}-${context.spanId}-${flags}`
}

// ─── tracestate ───────────────────────────────────────────────────────────────

/**
 * Vendor key regex from W3C Trace Context §3.3.2.1.
 * Simple key:  `[a-z][a-z0-9_\-*\/]{0,255}`
 * Tenant key:  `[a-z0-9][a-z0-9_\-*\/]{0,240}@[a-z][a-z0-9_\-*\/]{0,13}`
 */
const TRACESTATE_KEY_RE = /^[a-z][a-z0-9_\-*/]{0,255}$|^[a-z0-9][a-z0-9_\-*/]{0,240}@[a-z][a-z0-9_\-*/]{0,13}$/

/**
 * Vendor value regex — printable ASCII 0x20-0x7e, excluding ',' and '='.
 */
const TRACESTATE_VALUE_RE = /^[ -+\--<>-~]{0,256}$/

/**
 * Parse a raw `tracestate` header string into an ordered list of key=value
 * pairs.  Invalid entries are silently dropped.  Entries are capped at
 * `MAX_TRACESTATE_ENTRIES`.
 *
 * The spec allows multiple header values concatenated with commas.
 */
export function parseTraceState(raw: string): TraceState {
  if (typeof raw !== 'string' || raw.trim() === '') return []

  const entries: Array<{ key: string; value: string }> = []

  for (const part of raw.split(',')) {
    const trimmed = part.trim()
    if (!trimmed) continue

    const eqIdx = trimmed.indexOf('=')
    if (eqIdx <= 0) continue

    const key = trimmed.slice(0, eqIdx).trim()
    const value = trimmed.slice(eqIdx + 1).trim()

    if (!TRACESTATE_KEY_RE.test(key)) continue
    if (!TRACESTATE_VALUE_RE.test(value)) continue

    // Deduplicate: a key may only appear once (spec §3.3.1.1 step 2).
    if (entries.some((e) => e.key === key)) continue

    entries.push({ key, value })
    if (entries.length >= MAX_TRACESTATE_ENTRIES) break
  }

  return entries
}

/**
 * Serialise a `TraceState` into the canonical `tracestate` header value.
 * Returns an empty string when the state is empty.
 */
export function serializeTraceState(state: TraceState): string {
  return state.map(({ key, value }) => `${key}=${value}`).join(',')
}

/**
 * Prepend or update the VeriNode vendor entry (`vn`) in `traceState`.
 *
 * Per spec §3.3.1.3 the mutating vendor must move its entry to the leftmost
 * position in the list, dropping the previous occurrence if present.
 */
export function injectVeriNodeEntry(
  state: TraceState,
  spanId: string,
  sampled: boolean,
): TraceState {
  const filtered = state.filter((e) => e.key !== 'vn')
  const vnValue = `${spanId}-${sampled ? '1' : '0'}`
  const updated = [{ key: 'vn', value: vnValue }, ...filtered]
  // Cap to spec maximum.
  return updated.slice(0, MAX_TRACESTATE_ENTRIES)
}

// ─── Context propagation helpers ─────────────────────────────────────────────

/**
 * Extract a `TraceContext` from `traceparent` + `tracestate` HTTP header
 * strings.  Returns `null` when the `traceparent` is missing or invalid.
 */
export function extractContext(
  traceparentHeader: string | null | undefined,
  tracestateHeader: string | null | undefined,
): TraceContext | null {
  if (!traceparentHeader) return null

  const tp = parseTraceParent(traceparentHeader)
  if (!tp) return null

  const traceState = parseTraceState(tracestateHeader ?? '')

  return {
    traceId: tp.traceId,
    spanId: tp.parentId,
    traceState,
    sampled: isSampled(tp.flags),
  }
}

/**
 * Build the propagation header pair (`traceparent` + `tracestate`) from a
 * `TraceContext`.  Inject the VeriNode vendor entry into tracestate.
 */
export function injectContext(context: TraceContext): PropagationContext {
  const withVn = injectVeriNodeEntry(context.traceState, context.spanId, context.sampled)
  return {
    traceparent: buildTraceParent(context),
    tracestate: serializeTraceState(withVn),
  }
}

/**
 * Attach `traceparent` (and optionally `tracestate`) headers to an existing
 * `HeadersInit` object.  Returns a new `Headers` instance — does not mutate
 * the original.
 */
export function injectHeaders(
  context: TraceContext,
  existing?: HeadersInit,
): Headers {
  const headers = new Headers(existing)
  const { traceparent, tracestate } = injectContext(context)
  headers.set('traceparent', traceparent)
  if (tracestate) {
    headers.set('tracestate', tracestate)
  }
  return headers
}

/**
 * Extract a `TraceContext` directly from a `Headers` object (e.g., from an
 * incoming `Request`).
 */
export function extractFromHeaders(headers: Headers): TraceContext | null {
  return extractContext(
    headers.get('traceparent'),
    headers.get('tracestate'),
  )
}
