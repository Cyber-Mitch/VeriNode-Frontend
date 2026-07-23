/**
 * Webhook Delivery Service with Retry and Signature Verification (#108)
 *
 * Provides:
 *   - HMAC-SHA256 payload signing so receivers can verify authenticity.
 *   - Exponential-backoff retry queue with jitter (max 5 attempts by default).
 *   - Per-delivery status tracking: pending → delivered / failed.
 *   - Delivery history accessible via `getDeliveryRecords()`.
 *
 * Design notes:
 *   - All crypto uses the Web Crypto API (SubtleCrypto) — no extra dependencies.
 *   - The service is environment-agnostic (works in both Node test environments
 *     and the browser) because it only depends on the global `crypto` object.
 *   - Factory functions mirror the pattern used throughout the codebase:
 *     `createWebhookService(config)` for live use, plus pure utility exports
 *     (`signPayload`, `verifySignature`, `computeNextDelay`) for isolated tests.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

/** Well-known webhook event types produced by VeriNode services. */
export type WebhookEventType =
  | 'validator.attested'
  | 'validator.slashed'
  | 'validator.statusChanged'
  | 'staking.confirmed'
  | 'staking.failed'
  | 'node.online'
  | 'node.offline'
  | 'governance.proposalCreated'
  | 'governance.proposalResolved'

/** A single webhook event envelope ready to be delivered. */
export interface WebhookEvent {
  /** Unique identifier for this event (UUID v4 or caller-supplied). */
  id: string
  /** Discriminator for the event type. */
  type: WebhookEventType
  /** Unix-millisecond timestamp of when the event was created. */
  createdAt: number
  /** Arbitrary domain-specific payload. Must be JSON-serialisable. */
  payload: Record<string, unknown>
}

/** Delivery status lifecycle: pending → delivered | failed. */
export type DeliveryStatus = 'pending' | 'delivered' | 'failed'

/** Immutable record of a single delivery attempt / final outcome. */
export interface DeliveryRecord {
  deliveryId: string
  event: WebhookEvent
  targetUrl: string
  status: DeliveryStatus
  attempts: number
  /** HTTP status from the last attempt, or null if it never reached the network. */
  lastHttpStatus: number | null
  /** Error message from the last attempt, or null on success. */
  lastError: string | null
  createdAt: number
  updatedAt: number
}

/** Configuration supplied to `createWebhookService`. */
export interface WebhookServiceConfig {
  /**
   * Secret used to generate the HMAC-SHA256 signature sent in the
   * `X-VeriNode-Signature-256` header. Receivers must hold the same secret to
   * verify deliveries.
   */
  secret: string
  /**
   * Maximum delivery attempts per event before the delivery is marked failed.
   * @default 5
   */
  maxAttempts?: number
  /**
   * Base delay in milliseconds for the first retry (doubled each attempt).
   * @default 1000
   */
  baseDelayMs?: number
  /**
   * Upper cap on the computed backoff delay in milliseconds.
   * @default 30_000
   */
  maxDelayMs?: number
}

/** Public interface exposed by `createWebhookService`. */
export interface WebhookService {
  /**
   * Deliver `event` to `targetUrl`. Retries automatically on transient failures.
   * Resolves once the event is delivered or all retry attempts are exhausted.
   */
  deliver(event: WebhookEvent, targetUrl: string): Promise<DeliveryRecord>
  /**
   * Sign an arbitrary payload string with the configured secret. Returns the
   * hex-encoded HMAC-SHA256 digest in the format `sha256=<hex>`.
   */
  sign(payload: string): Promise<string>
  /**
   * Verify that `signature` (in the format `sha256=<hex>`) matches the
   * expected HMAC-SHA256 of `payload` under the configured secret.
   */
  verify(payload: string, signature: string): Promise<boolean>
  /** Snapshot of all delivery records tracked since service creation. */
  getDeliveryRecords(): ReadonlyArray<DeliveryRecord>
}

// ─── Constants ────────────────────────────────────────────────────────────────

export const SIGNATURE_HEADER = 'X-VeriNode-Signature-256'
const SIGNATURE_PREFIX = 'sha256='
const DEFAULT_MAX_ATTEMPTS = 5
const DEFAULT_BASE_DELAY_MS = 1_000
const DEFAULT_MAX_DELAY_MS = 30_000

// ─── Pure crypto utilities ────────────────────────────────────────────────────

/**
 * Imports a raw HMAC-SHA256 key from a UTF-8 secret string.
 * Kept internal — callers use `signPayload` / `verifySignature`.
 */
async function importHmacKey(secret: string): Promise<CryptoKey> {
  const enc = new TextEncoder()
  return crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  )
}

/**
 * Converts an ArrayBuffer to a lowercase hex string.
 */
function bufferToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * Compute the HMAC-SHA256 signature of `payload` under `secret`.
 * Returns the full header value, e.g. `sha256=abcd1234…`.
 *
 * Exported for isolated unit testing.
 */
export async function signPayload(payload: string, secret: string): Promise<string> {
  const key = await importHmacKey(secret)
  const enc = new TextEncoder()
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(payload))
  return `${SIGNATURE_PREFIX}${bufferToHex(sig)}`
}

/**
 * Verify that `signature` (format `sha256=<hex>`) is the correct HMAC-SHA256
 * of `payload` under `secret`. Uses constant-time comparison via SubtleCrypto
 * to prevent timing attacks.
 *
 * Returns `false` for malformed signatures rather than throwing.
 *
 * Exported for isolated unit testing.
 */
export async function verifySignature(
  payload: string,
  signature: string,
  secret: string,
): Promise<boolean> {
  if (!signature.startsWith(SIGNATURE_PREFIX)) return false
  const hexDigest = signature.slice(SIGNATURE_PREFIX.length)
  // Validate hex string before proceeding
  if (!/^[0-9a-f]{64}$/i.test(hexDigest)) return false

  const key = await importHmacKey(secret)
  const enc = new TextEncoder()

  // Convert the provided hex digest back to bytes for SubtleCrypto.verify,
  // which performs constant-time comparison internally.
  const providedBytes = new Uint8Array(
    hexDigest.match(/.{2}/g)!.map((byte) => parseInt(byte, 16)),
  )
  return crypto.subtle.verify('HMAC', key, providedBytes.buffer as ArrayBuffer, enc.encode(payload))
}

// ─── Retry backoff ────────────────────────────────────────────────────────────

/**
 * Compute the next retry delay using full-jitter exponential backoff.
 *
 *   delay = random(0, min(maxDelayMs, baseDelayMs * 2 ** attempt))
 *
 * `attempt` is 0-indexed (0 = first retry, after the initial attempt fails).
 *
 * Exported for isolated unit testing.
 */
export function computeNextDelay(
  attempt: number,
  baseDelayMs: number,
  maxDelayMs: number,
): number {
  const cap = Math.min(maxDelayMs, baseDelayMs * Math.pow(2, attempt))
  return Math.floor(Math.random() * cap)
}

// ─── Service factory ──────────────────────────────────────────────────────────

/**
 * Creates a webhook delivery service bound to a specific secret and retry
 * configuration. Multiple instances can co-exist with different secrets.
 */
export function createWebhookService(config: WebhookServiceConfig): WebhookService {
  const {
    secret,
    maxAttempts = DEFAULT_MAX_ATTEMPTS,
    baseDelayMs = DEFAULT_BASE_DELAY_MS,
    maxDelayMs = DEFAULT_MAX_DELAY_MS,
  } = config

  const records = new Map<string, DeliveryRecord>()

  function upsertRecord(partial: DeliveryRecord): DeliveryRecord {
    records.set(partial.deliveryId, partial)
    return partial
  }

  async function attemptDelivery(
    record: DeliveryRecord,
    body: string,
    signature: string,
  ): Promise<{ ok: boolean; httpStatus: number | null; error: string | null }> {
    try {
      const response = await fetch(record.targetUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          [SIGNATURE_HEADER]: signature,
          'X-VeriNode-Event': record.event.type,
          'X-VeriNode-Delivery': record.deliveryId,
        },
        body,
      })
      return { ok: response.ok, httpStatus: response.status, error: null }
    } catch (err: unknown) {
      const error = err instanceof Error ? err.message : 'Network error'
      return { ok: false, httpStatus: null, error }
    }
  }

  async function deliver(event: WebhookEvent, targetUrl: string): Promise<DeliveryRecord> {
    const deliveryId =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `delivery-${Date.now()}-${Math.round(Math.random() * 1e9)}`

    const now = Date.now()
    let record: DeliveryRecord = upsertRecord({
      deliveryId,
      event,
      targetUrl,
      status: 'pending',
      attempts: 0,
      lastHttpStatus: null,
      lastError: null,
      createdAt: now,
      updatedAt: now,
    })

    const body = JSON.stringify(event)
    const signature = await signPayload(body, secret)

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      // Apply backoff before every retry (not before the first attempt).
      if (attempt > 0) {
        const delay = computeNextDelay(attempt - 1, baseDelayMs, maxDelayMs)
        await new Promise<void>((resolve) => setTimeout(resolve, delay))
      }

      const result = await attemptDelivery(record, body, signature)
      record = upsertRecord({
        ...record,
        attempts: attempt + 1,
        lastHttpStatus: result.httpStatus,
        lastError: result.error,
        status: result.ok ? 'delivered' : attempt + 1 < maxAttempts ? 'pending' : 'failed',
        updatedAt: Date.now(),
      })

      if (result.ok) break
    }

    return record
  }

  return {
    deliver,

    sign(payload: string) {
      return signPayload(payload, secret)
    },

    verify(payload: string, signature: string) {
      return verifySignature(payload, signature, secret)
    },

    getDeliveryRecords() {
      return [...records.values()]
    },
  }
}
