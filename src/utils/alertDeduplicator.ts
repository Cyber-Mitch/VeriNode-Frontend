// Alert deduplication utility with 24-hour TTL.
//
// Prevents the same doppelganger event from triggering repeated alerts within
// a 24-hour window. Uses a compact bloom-filter-inspired approach backed by
// localStorage so the deduplication state survives page reloads.
//
// Storage key format: "verinode:doppelganger:dedup:v1"
// Stored value: JSON array of DedupEntry objects.
//
// Entries older than DEDUP_TTL_MS (24 h) are pruned on every read/write.

const STORAGE_KEY = 'verinode:doppelganger:dedup:v1';
export const DEDUP_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

interface DedupEntry {
  /** Canonical event key (e.g. pubkey:fromEpoch:toEpoch). */
  eventKey: string;
  /** Timestamp (ms) when the alert was first raised. */
  firstSeenAt: number;
}

// ── Persistence helpers ───────────────────────────────────────────────────────

function loadEntries(): DedupEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return (parsed as DedupEntry[]).filter(
      (e) =>
        typeof e === 'object' &&
        e !== null &&
        typeof e.eventKey === 'string' &&
        typeof e.firstSeenAt === 'number',
    );
  } catch {
    return [];
  }
}

function saveEntries(entries: DedupEntry[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // localStorage may be full or unavailable; fail silently.
  }
}

/** Prune entries older than TTL and return the live entries. */
function pruneStale(entries: DedupEntry[], nowMs: number): DedupEntry[] {
  return entries.filter((e) => nowMs - e.firstSeenAt < DEDUP_TTL_MS);
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Build a canonical event key for a doppelganger observation. Two observations
 * with the same pubkey over the same epoch window produce the same key.
 */
export function buildEventKey(pubkey: string, fromEpoch: number, toEpoch: number): string {
  return `${pubkey}:${fromEpoch}:${toEpoch}`;
}

/**
 * Returns `true` if the event identified by `eventKey` has already been
 * alerted within the last 24 hours and should be suppressed.
 */
export function isDuplicate(eventKey: string, nowMs: number = Date.now()): boolean {
  const entries = pruneStale(loadEntries(), nowMs);
  return entries.some((e) => e.eventKey === eventKey);
}

/**
 * Record that an alert was raised for `eventKey` so future calls to
 * `isDuplicate` within 24 hours return `true`.
 */
export function recordAlert(eventKey: string, nowMs: number = Date.now()): void {
  const entries = pruneStale(loadEntries(), nowMs);
  if (entries.some((e) => e.eventKey === eventKey)) return; // already recorded
  entries.push({ eventKey, firstSeenAt: nowMs });
  saveEntries(entries);
}

/**
 * Remove all stored deduplication state. Useful in tests or when the operator
 * explicitly resets suppression for a key.
 */
export function clearDeduplicationState(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

/**
 * Remove the deduplication record for a specific event key, allowing the alert
 * to fire again on the next scan. Called when the operator clicks "Suppress"
 * with the intent to re-enable future alerts for that key.
 */
export function removeEventKey(eventKey: string, nowMs: number = Date.now()): void {
  const entries = pruneStale(loadEntries(), nowMs).filter((e) => e.eventKey !== eventKey);
  saveEntries(entries);
}
