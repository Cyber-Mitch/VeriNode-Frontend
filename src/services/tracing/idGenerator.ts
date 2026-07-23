/**
 * Cryptographically-secure trace and span ID generator (#104).
 *
 * Uses `crypto.getRandomValues` (Web Crypto API — available in all modern
 * browsers and Node ≥ 15) to produce IDs that conform to the W3C Trace
 * Context specification:
 *
 *   - Trace ID: 32 lowercase hex characters (128 bits)
 *   - Span ID:  16 lowercase hex characters (64 bits)
 *
 * A deterministic fallback based on `Math.random` is used only when the
 * Crypto API is genuinely unavailable (e.g., very old environments or mocked
 * test contexts that strip globals).  The fallback is NOT cryptographically
 * secure and is clearly flagged as such.
 */

import type { TraceId, SpanId } from './types'

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Convert a `Uint8Array` to a lowercase hex string.
 */
function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * Returns `true` when the Web Crypto API is available in the current
 * environment.
 */
function hasCrypto(): boolean {
  return (
    typeof globalThis !== 'undefined' &&
    typeof globalThis.crypto !== 'undefined' &&
    typeof globalThis.crypto.getRandomValues === 'function'
  )
}

/**
 * Produce `byteCount` random bytes using Web Crypto when available, or a
 * non-cryptographic fallback otherwise.
 */
function randomBytes(byteCount: number): Uint8Array {
  const buf = new Uint8Array(byteCount)
  if (hasCrypto()) {
    globalThis.crypto.getRandomValues(buf)
  } else {
    // Non-secure fallback — only hit in stripped test environments.
    for (let i = 0; i < byteCount; i++) {
      buf[i] = Math.floor(Math.random() * 256)
    }
  }
  return buf
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Generate a W3C-compliant 128-bit trace ID (32 lowercase hex chars).
 *
 * The all-zeroes value (`00000000000000000000000000000000`) is reserved by
 * the spec as invalid; this implementation regenerates if it ever occurs
 * (probability ≈ 2^{-128}, i.e. practically impossible).
 */
export function generateTraceId(): TraceId {
  let hex: string
  do {
    hex = toHex(randomBytes(16))
  } while (hex === '00000000000000000000000000000000')
  return hex
}

/**
 * Generate a W3C-compliant 64-bit span ID (16 lowercase hex chars).
 *
 * The all-zeroes value (`0000000000000000`) is reserved as invalid; this
 * implementation regenerates if it ever occurs.
 */
export function generateSpanId(): SpanId {
  let hex: string
  do {
    hex = toHex(randomBytes(8))
  } while (hex === '0000000000000000')
  return hex
}
