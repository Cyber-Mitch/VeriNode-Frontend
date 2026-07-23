/**
 * Distributed Tracing — Public API (#104)
 *
 * Single entry-point for the VeriNode distributed tracing package.
 *
 * Usage:
 * ```ts
 * import { getGlobalTracer, injectHeaders, extractFromHeaders } from '@/services/tracing'
 *
 * // Instrument an async operation:
 * const tracer = getGlobalTracer()
 * await tracer.withSpanAsync('my-operation', {}, async (span) => {
 *   span.setAttribute('custom.key', 'value')
 *   // ... do work ...
 * })
 *
 * // Propagate context in outgoing fetch:
 * const headers = injectHeaders(tracer.activeContext()!)
 * await fetch('/api/endpoint', { headers })
 * ```
 */

// ── Types ─────────────────────────────────────────────────────────────────────
export type {
  TraceId,
  SpanId,
  TraceParent,
  TraceState,
  SpanKind,
  SpanStatus,
  AttributeValue,
  SpanAttributes,
  SpanEvent,
  ReadableSpan,
  Span,
  SpanOptions,
  PropagationContext,
  TraceContext,
  SpanExporter,
  SamplingResult,
  Sampler,
} from './types'

// ── ID generation ─────────────────────────────────────────────────────────────
export { generateTraceId, generateSpanId } from './idGenerator'

// ── Propagation ───────────────────────────────────────────────────────────────
export {
  parseTraceParent,
  serializeTraceParent,
  isSampled,
  buildTraceParent,
  parseTraceState,
  serializeTraceState,
  injectVeriNodeEntry,
  extractContext,
  injectContext,
  injectHeaders,
  extractFromHeaders,
} from './propagation'

// ── Samplers ──────────────────────────────────────────────────────────────────
export {
  AlwaysOnSampler,
  AlwaysOffSampler,
  TraceIdRatioSampler,
  ParentBasedSampler,
  defaultSampler,
} from './sampler'

// ── Exporters ─────────────────────────────────────────────────────────────────
export {
  ConsoleSpanExporter,
  OtlpHttpExporter,
  CompositeExporter,
} from './exporter'
export type { OtlpHttpExporterOptions } from './exporter'

// ── Tracer / Provider ─────────────────────────────────────────────────────────
export {
  Tracer,
  TracerProvider,
  registerGlobalProvider,
  getGlobalTracer,
  getGlobalProvider,
} from './tracer'
export type { TracerProviderConfig } from './tracer'
