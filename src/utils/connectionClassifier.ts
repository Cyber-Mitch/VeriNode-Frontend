export type WebSocketTier = 1 | 2 | 3

export type WebSocketCloseClassification =
  | {
      tier: 1
      label: 'normal'
      closeCode: number
      reason?: string
    }
  | {
      tier: 2
      label: 'abnormal'
      closeCode?: number
      reason?: string
    }
  | {
      tier: 3
      label: 'auth-error' | 'version-mismatch'
      closeCode?: number
      reason?: string
    }

const AUTH_CODE_RE = /^400\d$/ // 4000–4009 inclusive
const VERSION_MISMATCH_CODE_RE = /^300\d$/ // 3000–3009 inclusive

/**
 * Classify WebSocket close codes into reconnection tiers.
 *
 * Tier mapping (per issue spec):
 * - `1000` → Tier 1 (normal / transient)
 * - `1006` / `1015` → Tier 2 (abnormal / network instability)
 * - `4000–4009` → Tier 3 (auth error)
 * - `3000–3009` → Tier 3 (version mismatch)
 * - anything else → Tier 2 (abnormal)
 */
export function classifyWebSocketCloseCode(
  code: number | undefined,
  reason?: string,
): WebSocketCloseClassification {
  if (code === 1000) {
    return { tier: 1, label: 'normal', closeCode: 1000, reason }
  }

  if (code === 1006 || code === 1015) {
    return { tier: 2, label: 'abnormal', closeCode: code, reason }
  }

  if (typeof code === 'number') {
    const asString = String(code)
    if (AUTH_CODE_RE.test(asString)) {
      return { tier: 3, label: 'auth-error', closeCode: code, reason }
    }
    if (VERSION_MISMATCH_CODE_RE.test(asString)) {
      return { tier: 3, label: 'version-mismatch', closeCode: code, reason }
    }
  }

  return { tier: 2, label: 'abnormal', closeCode: code, reason }
}

