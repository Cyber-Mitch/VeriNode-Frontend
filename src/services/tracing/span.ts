/**
 * Span implementation (#104)
 *
 * Provides the mutable `SpanImpl` class that records a single unit of work
 * within a distributed trace.  Once `end()` is called the span is frozen and
 * forwarded to the registered exporter(s) via the provider callback.
 *
 * The implementation is intentionally kept free of global side-effects so
 * that it can be constructed and asserted in isolated unit tests without
 * mocking the tracer provider.
 */

import type {
  Span,
  SpanKind,
  SpanStatus,
  SpanAttributes,
  SpanEvent,
  AttributeValue,
  ReadableSpan,
  TraceContext,
  TraceState,
  TraceId,
  SpanId,
} from './types'

// ─── SpanImpl ─────────────────────────────────────────────────────────────────

/** Callback invoked by the span when it ends so the provider can export it. */
export type OnSpanEnd = (span: ReadableSpan) => void

/**
 * Mutable, fully-featured span implementation aligned with the OTel Span API.
 *
 * Consumers interact with the public `Span` interface — `SpanImpl` is an
 * internal detail of the tracing package and is not exported from the
 * package's public index.
 */
export class SpanImpl implements Span {
  // ── identity ──────────────────────────────────────────────────────────────

  readonly traceId: TraceId
  readonly spanId: SpanId
  readonly parentSpanId: SpanId | null
  readonly name: string
  readonly kind: SpanKind

  // ── timing ────────────────────────────────────────────────────────────────

  private readonly startTimeMs: number
  private endTimeMsValue: number = 0

  // ── state ─────────────────────────────────────────────────────────────────

  private statusValue: SpanStatus = 'UNSET'
  private statusMessage: string | undefined
  private ended = false

  // ── data ──────────────────────────────────────────────────────────────────

  private readonly attrs: SpanAttributes = {}
  private readonly eventsLog: SpanEvent[] = []
  private readonly traceStateValue: TraceState
  private readonly library: string

  // ── callback ──────────────────────────────────────────────────────────────

  private readonly onEnd: OnSpanEnd

  constructor(params: {
    traceId: TraceId
    spanId: SpanId
    parentSpanId: SpanId | null
    name: string
    kind: SpanKind
    startTimeMs: number
    traceState: TraceState
    attributes?: SpanAttributes
    instrumentationLibrary: string
    onEnd: OnSpanEnd
  }) {
    this.traceId = params.traceId
    this.spanId = params.spanId
    this.parentSpanId = params.parentSpanId
    this.name = params.name
    this.kind = params.kind
    this.startTimeMs = params.startTimeMs
    this.traceStateValue = params.traceState
    this.library = params.instrumentationLibrary
    this.onEnd = params.onEnd

    if (params.attributes) {
      Object.assign(this.attrs, params.attributes)
    }
  }

  // ── Span interface ────────────────────────────────────────────────────────

  get isEnded(): boolean {
    return this.ended
  }

  setAttribute(key: string, value: AttributeValue): this {
    if (!this.ended) {
      this.attrs[key] = value
    }
    return this
  }

  setAttributes(attributes: SpanAttributes): this {
    if (!this.ended) {
      Object.assign(this.attrs, attributes)
    }
    return this
  }

  addEvent(name: string, attributes?: SpanAttributes): this {
    if (!this.ended) {
      this.eventsLog.push({
        name,
        timestampMs: Date.now(),
        attributes,
      })
    }
    return this
  }

  setStatus(status: SpanStatus, message?: string): this {
    if (!this.ended) {
      // Per OTel spec, once OK is set it cannot be changed to a lower-priority status.
      if (this.statusValue === 'OK' && status !== 'OK') return this
      this.statusValue = status
      this.statusMessage = message
    }
    return this
  }

  end(endTimeMs?: number): void {
    if (this.ended) return
    this.ended = true
    this.endTimeMsValue = endTimeMs ?? Date.now()
    this.onEnd(this.toReadable())
  }

  toReadable(): ReadableSpan {
    return {
      traceId: this.traceId,
      spanId: this.spanId,
      parentSpanId: this.parentSpanId,
      name: this.name,
      kind: this.kind,
      startTimeMs: this.startTimeMs,
      endTimeMs: this.endTimeMsValue,
      status: this.statusValue,
      statusMessage: this.statusMessage,
      attributes: { ...this.attrs },
      events: [...this.eventsLog],
      traceState: this.traceStateValue,
      instrumentationLibrary: this.library,
    }
  }

  /** Expose the active trace context so child spans can link to this one. */
  toTraceContext(sampled: boolean): TraceContext {
    return {
      traceId: this.traceId,
      spanId: this.spanId,
      traceState: this.traceStateValue,
      sampled,
    }
  }
}
