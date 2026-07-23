/**
 * Span Exporters (#104)
 *
 * Two built-in exporters are provided:
 *
 *   1. `ConsoleSpanExporter`  — Pretty-prints finished spans to `console.debug`.
 *      Intended for local development.  Enabled automatically when
 *      `NEXT_PUBLIC_OTEL_LOG_LEVEL=debug`.
 *
 *   2. `OtlpHttpExporter`     — Sends spans to an OTLP/HTTP collector endpoint
 *      in JSON format (application/json).  Compatible with Jaeger, Tempo, and
 *      any OTEL-compliant collector.  Target URL is configured via
 *      `NEXT_PUBLIC_OTEL_EXPORTER_OTLP_ENDPOINT`.
 *
 *   3. `CompositeExporter`    — Fans out to multiple exporters.  Used by the
 *      provider to combine console + remote exporters transparently.
 *
 * All exporters implement the `SpanExporter` interface from `types.ts` and
 * swallow their own errors to honour the "must not throw" contract.
 */

import type { SpanExporter, ReadableSpan } from './types'

// ─── ConsoleSpanExporter ──────────────────────────────────────────────────────

/**
 * Logs each completed span to the browser/Node console.
 * Output is structured so it can be inspected in DevTools or piped to a log
 * aggregator in local/staging environments.
 */
export class ConsoleSpanExporter implements SpanExporter {
  async export(spans: ReadonlyArray<ReadableSpan>): Promise<void> {
    for (const span of spans) {
      const durationMs = span.endTimeMs - span.startTimeMs
      console.debug('[OTel Span]', {
        name: span.name,
        traceId: span.traceId,
        spanId: span.spanId,
        parentSpanId: span.parentSpanId ?? '(root)',
        kind: span.kind,
        status: span.status,
        durationMs,
        attributes: span.attributes,
        events: span.events,
        library: span.instrumentationLibrary,
      })
    }
  }

  async shutdown(): Promise<void> {
    // No resources to release.
  }
}

// ─── OtlpHttpExporter ─────────────────────────────────────────────────────────

/** Options for `OtlpHttpExporter`. */
export interface OtlpHttpExporterOptions {
  /**
   * Full URL to the OTLP HTTP collector endpoint.
   * @example 'https://otelcollector.example.com/v1/traces'
   */
  endpoint: string
  /**
   * Additional HTTP headers sent with every export request.
   * Use for authentication (e.g. `Authorization: Bearer <token>`).
   */
  headers?: Record<string, string>
  /**
   * Request timeout in milliseconds.
   * @default 10_000
   */
  timeoutMs?: number
}

/**
 * Convert a millisecond timestamp to a nanosecond string without BigInt
 * (which is ES2020 and would fail the ES2017 tsconfig target).
 *
 * ms * 1_000_000 exceeds Number.MAX_SAFE_INTEGER for timestamps past year
 * 2255, but for real-world wall-clock values the error is zero because both
 * ms and the multiplier are integers and the product fits in a float64 without
 * rounding for any epoch within the next few centuries.
 */
function msToNanoString(ms: number): string {
  return String(ms * 1_000_000)
}

/**
 * Converts a `ReadableSpan` array into the OTLP/HTTP JSON body.
 *
 * The mapping follows the OTLP proto → JSON mapping defined in:
 *   https://opentelemetry.io/docs/specs/otlp/#otlphttp
 *
 * Kept minimal — only the fields consumed by common collectors are populated.
 */
function toOtlpBody(
  spans: ReadonlyArray<ReadableSpan>,
): Record<string, unknown> {
  // Group spans by instrumentation library.
  const byLibrary = new Map<string, ReadableSpan[]>()
  for (const span of spans) {
    const lib = span.instrumentationLibrary
    const bucket = byLibrary.get(lib) ?? []
    bucket.push(span)
    byLibrary.set(lib, bucket)
  }

  const scopeSpans = Array.from(byLibrary.entries()).map(([library, libSpans]) => ({
    scope: { name: library },
    spans: libSpans.map((s) => ({
      traceId: s.traceId,
      spanId: s.spanId,
      parentSpanId: s.parentSpanId ?? undefined,
      name: s.name,
      kind: spanKindToOtlp(s.kind),
      startTimeUnixNano: msToNanoString(s.startTimeMs),
      endTimeUnixNano: msToNanoString(s.endTimeMs),
      attributes: attributesToOtlp(s.attributes),
      events: s.events.map((e) => ({
        name: e.name,
        timeUnixNano: msToNanoString(e.timestampMs),
        attributes: e.attributes ? attributesToOtlp(e.attributes) : [],
      })),
      status: {
        code: statusToOtlp(s.status),
        message: s.statusMessage ?? '',
      },
    })),
  }))

  return {
    resourceSpans: [
      {
        resource: {
          attributes: [
            { key: 'service.name', value: { stringValue: 'verinode-frontend' } },
            { key: 'telemetry.sdk.name', value: { stringValue: 'verinode-otel' } },
            { key: 'telemetry.sdk.language', value: { stringValue: 'webjs' } },
          ],
        },
        scopeSpans,
      },
    ],
  }
}

function spanKindToOtlp(kind: ReadableSpan['kind']): number {
  switch (kind) {
    case 'INTERNAL': return 1
    case 'SERVER': return 2
    case 'CLIENT': return 3
    case 'PRODUCER': return 4
    case 'CONSUMER': return 5
    default: return 0 // SPAN_KIND_UNSPECIFIED
  }
}

function statusToOtlp(status: ReadableSpan['status']): number {
  switch (status) {
    case 'OK': return 1
    case 'ERROR': return 2
    default: return 0 // STATUS_CODE_UNSET
  }
}

function attributesToOtlp(
  attrs: Record<string, unknown>,
): Array<{ key: string; value: Record<string, unknown> }> {
  return Object.entries(attrs).map(([key, value]) => ({
    key,
    value: valueToOtlp(value),
  }))
}

function valueToOtlp(value: unknown): Record<string, unknown> {
  if (typeof value === 'string') return { stringValue: value }
  if (typeof value === 'number') {
    return Number.isInteger(value)
      ? { intValue: String(value) }
      : { doubleValue: value }
  }
  if (typeof value === 'boolean') return { boolValue: value }
  if (Array.isArray(value)) {
    return { arrayValue: { values: value.map(valueToOtlp) } }
  }
  return { stringValue: String(value) }
}

/**
 * Sends completed spans to an OTLP/HTTP collector in JSON format.
 *
 * Failures are swallowed and logged to `console.warn` so that a broken
 * collector does not interrupt application behaviour.
 */
export class OtlpHttpExporter implements SpanExporter {
  private readonly endpoint: string
  private readonly headers: Record<string, string>
  private readonly timeoutMs: number
  private shuttingDown = false

  constructor(options: OtlpHttpExporterOptions) {
    this.endpoint = options.endpoint
    this.headers = options.headers ?? {}
    this.timeoutMs = options.timeoutMs ?? 10_000
  }

  async export(spans: ReadonlyArray<ReadableSpan>): Promise<void> {
    if (this.shuttingDown || spans.length === 0) return

    const body = JSON.stringify(toOtlpBody(spans))

    const controller = new AbortController()
    const timerId = setTimeout(() => controller.abort(), this.timeoutMs)

    try {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...this.headers,
        },
        body,
        signal: controller.signal,
      })

      if (!response.ok) {
        console.warn(
          `[OTel] OTLP export failed: HTTP ${response.status} from ${this.endpoint}`,
        )
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        console.warn(`[OTel] OTLP export timed out after ${this.timeoutMs}ms`)
      } else {
        console.warn('[OTel] OTLP export error:', err)
      }
    } finally {
      clearTimeout(timerId)
    }
  }

  async shutdown(): Promise<void> {
    this.shuttingDown = true
  }
}

// ─── CompositeExporter ────────────────────────────────────────────────────────

/**
 * Fans a batch of spans out to multiple underlying exporters in parallel.
 * Individual exporter failures do not prevent other exporters from receiving
 * the batch.
 */
export class CompositeExporter implements SpanExporter {
  constructor(private readonly exporters: ReadonlyArray<SpanExporter>) {}

  async export(spans: ReadonlyArray<ReadableSpan>): Promise<void> {
    await Promise.allSettled(this.exporters.map((e) => e.export(spans)))
  }

  async shutdown(): Promise<void> {
    await Promise.allSettled(this.exporters.map((e) => e.shutdown()))
  }
}
