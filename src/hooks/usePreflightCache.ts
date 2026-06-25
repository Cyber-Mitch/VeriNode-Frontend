'use client'

import { useMemo } from 'react'
import type { SimulationResult } from '@/src/lib/api/simulate'

/** Cached simulation results live for 60 seconds. */
export const PREFLIGHT_TTL_MS = 60_000

interface CacheEntry {
  result: SimulationResult
  expiresAt: number
}

// Module-level so the cache survives modal close/reopen within the session.
const cache = new Map<string, CacheEntry>()

/**
 * SHA-256 hex of the transaction XDR — the cache key. Uses Web Crypto when
 * available (browser / Node ≥ 20) and falls back to a non-crypto FNV-1a hash
 * only when SubtleCrypto is absent (so keys are always derivable).
 */
export async function preflightCacheKey(xdr: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle
  if (subtle) {
    const digest = await subtle.digest('SHA-256', new TextEncoder().encode(xdr))
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
  }
  let hash = 0x811c9dc5
  for (let i = 0; i < xdr.length; i++) {
    hash ^= xdr.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return `fnv-${(hash >>> 0).toString(16)}`
}

export interface PreflightCache {
  get: (key: string, now?: number) => SimulationResult | null
  set: (key: string, result: SimulationResult, now?: number) => void
  clear: () => void
}

/**
 * Access the shared pre-flight result cache (keyed by SHA-256 of the tx XDR,
 * 60s TTL). Returns a stable handle so it can be used as an effect dependency.
 */
export function usePreflightCache(): PreflightCache {
  return useMemo<PreflightCache>(
    () => ({
      get(key, now = Date.now()) {
        const entry = cache.get(key)
        if (!entry) return null
        if (entry.expiresAt <= now) {
          cache.delete(key)
          return null
        }
        return entry.result
      },
      set(key, result, now = Date.now()) {
        cache.set(key, { result, expiresAt: now + PREFLIGHT_TTL_MS })
      },
      clear() {
        cache.clear()
      },
    }),
    [],
  )
}
