/**
 * OpenTelemetry-compatible Distributed Tracing — Type Definitions (#104)
 *
 * Implements the W3C Trace Context specification (traceparent / tracestate)
 * and an OpenTelemetry-aligned span model.  All primitives are pure TypeScript
 * interfaces and value types — no external runtime dependencies.
 *
 * Spec references:
 *   - W3C Trace Context: https://www.w3.org/TR/trace-context/
 *   - OpenTelemetry API: https://opentelemetry.io/docs/specs/otel/trace/api/
 */

// ─── Identifiers ─────────────────────────────────────────────────────────────

/** 32 lowercase hex characters — 128-bit trace identifier. */
export type TraceId = string

/** 16 lowercase hex characters — 64-bit span identifier. */
export type SpanId = string

// ─── W3C Trace Context ───────────────────────────────────────────────────────

/**
 * Parsed representation of a W3C `traceparent` header value.
 *
 * Format: `{version}-{traceId}-{parentId}-{flags}`
 * Example: `00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01`
 */
export interface TraceParent {
  /** Must be `"00"` — the only version currently standardised. */
  version: '00'
  /** 128-bit trace identifier (32 hex chars). */
  traceId: TraceId
  /** 64-bit parent span identifier (16 hex chars). */
  parentId: SpanId
  /** 8-bit flags byte (2 hex chars). Bit 0 = sampled. */
  flags: string
}

/**
 * Parsed representation of a W3C `tracestate` header value.
 *
 * A list of vendor-specific key-value pairs, ordered by recency (most recent
 * vendor first).  Each key must match `[a-z][a-z0-9_\-*\/]{0,255}` (or the
 * multi-tenant form) per the spec.
 */
export type TraceState = ReadonlyArray<{ key: string; value: string }>

// ─── Span ─────────────────────────────────────────────────────────────────────

/** OpenTelemetry canonical span kinds. */
export type SpanKind = 'INTERNAL' | 'SERVER' | 'CLIENT' | 'PRODUCER' | 'CONSUMER'

/** Lifecycle status of a span. */
export type SpanStatus = 'UNSET' | 'OK' | 'ERROR'

/** Attribute value types supported by OTLP / OTel SDK. */
export type AttributeValue = string | number | boolean | string[] | number[] | boolean[]

/** Span attribute map. */
export type SpanAttributes = Record<string, AttributeValue>

/** A single timed event attached to a span. */
export interface SpanEvent {
  /** Human-readable event name. */
  name: string
  /** Wall-clock timestamp (milliseconds since epoch). */
  timestampMs: number
  /** Optional attributes associated with the event. */
  attributes?: SpanAttributes
}

/** An immutable, fully-ended span record ready for export. */
export interface ReadableSpan {
  /** 128-bit trace identifier shared by all spans in the same trace. */
  traceId: TraceId
  /** 64-bit identifier unique within the trace. */
  spanId: SpanId
  /** Parent span identifier, or `null` for root spans. */
  parentSpanId: SpanId | null
  /** Human-readable operation name. */
  name: string
  /** Span kind (default: INTERNAL). */
  kind: SpanKind
  /** Wall-clock start time (ms since epoch). */
  startTimeMs: number
  /** Wall-clock end time (ms since epoch).  Set only after `end()` is called. */
  endTimeMs: number
  /** Outcome status. */
  status: SpanStatus
  /** Optional status message (used when status === ERROR). */
  statusMessage?: string
  /** Key-value attributes attached to this span. */
  attributes: SpanAttributes
  /** Ordered list of events added during the span's lifetime. */
  events: ReadonlyArray<SpanEvent>
  /** Propagated trace state (vendor extensions). */
  traceState: TraceState
  /** Name of the instrumentation library that created the span. */
  instrumentationLibrary: string
}

// ─── Active / mutable span interface ─────────────────────────────────────────

/**
 * The mutable view of a span available while it is still active.
 * Mirrors the OTel Span API surface used throughout the codebase.
 */
export interface Span {
  /** Read access to the span's trace-context fields. */
  readonly traceId: TraceId
  readonly spanId: SpanId
  readonly parentSpanId: SpanId | null
  readonly name: string
  readonly kind: SpanKind

  /**
   * Set (or override) a single attribute.  Calling after `end()` is a no-op.
   */
  setAttribute(key: string, value: AttributeValue): this

  /** Bulk-set attributes from a plain object. */
  setAttributes(attributes: SpanAttributes): this

  /** Append a timed event to the span. */
  addEvent(name: string, attributes?: SpanAttributes): this

  /** Mark the span as successfully completed. */
  setStatus(status: SpanStatus, message?: string): this

  /**
   * End the span.  Once called all mutation methods become no-ops.
   * `endTimeMs` defaults to `Date.now()` when omitted.
   */
  end(endTimeMs?: number): void

  /** Snapshot the span as an immutable record for export / assertion. */
  toReadable(): ReadableSpan

  /** Whether `end()` has already been called. */
  readonly isEnded: boolean
}

// ─── Tracer ───────────────────────────────────────────────────────────────────

/** Options accepted when starting a new span. */
export interface SpanOptions {
  /**
   * Override the span kind (default: INTERNAL).
   */
  kind?: SpanKind
  /**
   * Initial attributes applied before the body runs.
   */
  attributes?: SpanAttributes
  /**
   * Explicit parent context.  When omitted the tracer uses the active context.
   */
  parentContext?: TraceContext | null
  /**
   * Override the wall-clock start time (ms since epoch).
   * Useful when wrapping an already-measured operation.
   */
  startTimeMs?: number
}

/** Propagation context carried on `fetch` / cross-boundary calls. */
export interface PropagationContext {
  /** Serialised `traceparent` header value. */
  traceparent: string
  /** Serialised `tracestate` header value (may be empty string). */
  tracestate: string
}

/**
 * Minimal context object used to link parent ↔ child spans.
 * Carry this through async boundaries to preserve distributed trace chains.
 */
export interface TraceContext {
  traceId: TraceId
  spanId: SpanId
  traceState: TraceState
  /** True when this span should be sampled / recorded. */
  sampled: boolean
}

// ─── Exporter ─────────────────────────────────────────────────────────────────

/** A sink that receives completed spans. */
export interface SpanExporter {
  /**
   * Called by the tracer provider whenever a batch of spans is ready.
   * Must not throw — handle internal errors and return a resolved promise.
   */
  export(spans: ReadonlyArray<ReadableSpan>): Promise<void>

  /** Called once during provider shutdown. */
  shutdown(): Promise<void>
}

// ─── Sampling ─────────────────────────────────────────────────────────────────

/** Sampling decision returned by a `Sampler`. */
export interface SamplingResult {
  /** Whether this trace should be recorded. */
  shouldSample: boolean
  /** Additional attributes to attach to the span (e.g. sampling ratio). */
  attributes?: SpanAttributes
}

/**
 * Determines whether a given trace should be recorded.
 * Two built-in implementations are provided: `AlwaysOnSampler` and
 * `TraceIdRatioSampler`.
 */
export interface Sampler {
  shouldSample(traceId: TraceId, spanName: string): SamplingResult
}
