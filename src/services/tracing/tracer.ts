/**
 * Tracer and TracerProvider (#104)
 *
 * Provides:
 *   - `Tracer`         — creates spans and manages the async context stack.
 *   - `TracerProvider` — root object that wires together the sampler,
 *                        exporter, and batch processor.
 *   - `getGlobalTracer()` — convenience accessor for the default tracer.
 *
 * Context propagation across async boundaries uses a simple call-stack array
 * (`_contextStack`) because the AsyncLocalStorage / AsyncContext APIs are not
 * reliably available in all target environments (browser + Edge runtime).
 * For cross-service propagation the caller is responsible for forwarding the
 * `TraceContext` object explicitly — see `withSpan` / `withSpanAsync`.
 *
 * Performance note:
 *   Spans that are not sampled are still allocated but their `onEnd` callback
 *   is a no-op so they add zero export overhead.  The allocation overhead is
 *   negligible for typical UI code paths.
 */

import type {
  Span,
  SpanOptions,
  SpanKind,
  TraceContext,
  SpanExporter,
  Sampler,
  ReadableSpan,
} from './types'
import { generateTraceId, generateSpanId } from './idGenerator'
import { SpanImpl } from './span'
import { defaultSampler } from './sampler'
import { ConsoleSpanExporter, CompositeExporter } from './exporter'

// ─── Batch processor ──────────────────────────────────────────────────────────

const DEFAULT_BATCH_SIZE = 50
const DEFAULT_FLUSH_INTERVAL_MS = 5_000

/**
 * Simple in-memory batch processor.  Flushes to the exporter either when the
 * batch reaches `maxBatchSize` or after `flushIntervalMs` has elapsed.
 */
class BatchProcessor {
  private queue: ReadableSpan[] = []
  private timer: ReturnType<typeof setInterval> | null = null

  constructor(
    private readonly exporter: SpanExporter,
    private readonly maxBatchSize = DEFAULT_BATCH_SIZE,
    private readonly flushIntervalMs = DEFAULT_FLUSH_INTERVAL_MS,
  ) {}

  start(): void {
    if (typeof setInterval === 'undefined') return
    this.timer = setInterval(() => {
      void this.flush()
    }, this.flushIntervalMs)
    // Allow the process to exit even when the timer is pending.
    if (this.timer && typeof this.timer === 'object' && 'unref' in this.timer) {
      // Node.js only
      (this.timer as NodeJS.Timeout).unref()
    }
  }

  onSpanEnd(span: ReadableSpan): void {
    this.queue.push(span)
    if (this.queue.length >= this.maxBatchSize) {
      void this.flush()
    }
  }

  async flush(): Promise<void> {
    if (this.queue.length === 0) return
    const batch = this.queue.splice(0)
    try {
      await this.exporter.export(batch)
    } catch {
      // Swallow — exporter must not break the app.
    }
  }

  async shutdown(): Promise<void> {
    if (this.timer !== null) {
      clearInterval(this.timer)
      this.timer = null
    }
    await this.flush()
    await this.exporter.shutdown()
  }
}

// ─── Tracer ───────────────────────────────────────────────────────────────────

/** Default instrumentation library name injected into all spans. */
const DEFAULT_LIBRARY = 'verinode-frontend'

/**
 * Creates and manages spans within a single instrumentation library.
 *
 * Obtain a `Tracer` instance via `TracerProvider.getTracer()` or the
 * `getGlobalTracer()` singleton helper.
 */
export class Tracer {
  private readonly contextStack: TraceContext[] = []

  constructor(
    private readonly library: string,
    private readonly processor: BatchProcessor,
    private readonly sampler: Sampler,
  ) {}

  // ── Active context ────────────────────────────────────────────────────────

  /** Returns the innermost active `TraceContext`, or `null` if none. */
  activeContext(): TraceContext | null {
    return this.contextStack.length > 0
      ? this.contextStack[this.contextStack.length - 1]
      : null
  }

  // ── Span creation ─────────────────────────────────────────────────────────

  /**
   * Start a new span.
   *
   * The span is linked to the active context (or `options.parentContext` when
   * explicitly provided).  If no parent exists this becomes a root span with
   * a fresh trace ID.
   */
  startSpan(name: string, options: SpanOptions = {}): Span {
    const parent =
      options.parentContext !== undefined
        ? options.parentContext
        : this.activeContext()

    const traceId = parent?.traceId ?? generateTraceId()
    const spanId = generateSpanId()
    const traceState = parent?.traceState ?? []
    const kind: SpanKind = options.kind ?? 'INTERNAL'

    // Determine sampling.
    const parentSampled = parent?.sampled
    const { shouldSample, attributes: samplerAttrs } =
      (this.sampler as unknown as {
        shouldSample(
          traceId: string,
          name: string,
          parentSampled?: boolean,
        ): ReturnType<Sampler['shouldSample']>
      }).shouldSample(traceId, name, parentSampled)

    const onEnd = shouldSample
      ? (span: ReadableSpan) => this.processor.onSpanEnd(span)
      : () => { /* not sampled — discard */ }

    const span = new SpanImpl({
      traceId,
      spanId,
      parentSpanId: parent?.spanId ?? null,
      name,
      kind,
      startTimeMs: options.startTimeMs ?? Date.now(),
      traceState,
      attributes: { ...samplerAttrs, ...options.attributes },
      instrumentationLibrary: this.library,
      onEnd,
    })

    return span
  }

  // ── Convenience wrappers ──────────────────────────────────────────────────

  /**
   * Execute a synchronous callback within a new span.  The span is
   * automatically ended when the callback returns (or throws).
   *
   * The span is pushed onto the context stack for the duration of the call so
   * that nested `startSpan()` calls link to it automatically.
   */
  withSpan<T>(name: string, options: SpanOptions, fn: (span: Span) => T): T {
    const span = this.startSpan(name, options)
    const impl = span as SpanImpl
    const ctx = impl.toTraceContext(true)
    this.contextStack.push(ctx)
    try {
      const result = fn(span)
      span.setStatus('OK')
      span.end()
      return result
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      span.setStatus('ERROR', message)
      span.end()
      throw err
    } finally {
      this.contextStack.pop()
    }
  }

  /**
   * Execute an async callback within a new span.  Equivalent to `withSpan`
   * but awaits the returned `Promise`.
   */
  async withSpanAsync<T>(
    name: string,
    options: SpanOptions,
    fn: (span: Span) => Promise<T>,
  ): Promise<T> {
    const span = this.startSpan(name, options)
    const impl = span as SpanImpl
    const ctx = impl.toTraceContext(true)
    this.contextStack.push(ctx)
    try {
      const result = await fn(span)
      span.setStatus('OK')
      span.end()
      return result
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      span.setStatus('ERROR', message)
      span.end()
      throw err
    } finally {
      this.contextStack.pop()
    }
  }
}

// ─── TracerProvider ───────────────────────────────────────────────────────────

/** Configuration for `TracerProvider`. */
export interface TracerProviderConfig {
  /**
   * Sampling strategy.  Defaults to `ParentBasedSampler(AlwaysOnSampler)`.
   */
  sampler?: Sampler
  /**
   * Span exporters.  Multiple exporters are wrapped in a `CompositeExporter`.
   * When omitted and `NODE_ENV !== 'production'` a `ConsoleSpanExporter` is
   * used automatically.
   */
  exporters?: SpanExporter[]
  /**
   * Maximum spans per export batch.
   * @default 50
   */
  maxBatchSize?: number
  /**
   * Milliseconds between automatic flush cycles.
   * @default 5_000
   */
  flushIntervalMs?: number
}

/**
 * Root object that creates `Tracer` instances and owns the batch processor.
 *
 * Typically one `TracerProvider` is created at application startup and
 * registered as the global provider via `registerGlobalProvider()`.
 */
export class TracerProvider {
  private readonly processor: BatchProcessor
  private readonly sampler: Sampler
  private readonly tracers = new Map<string, Tracer>()

  constructor(config: TracerProviderConfig = {}) {
    const {
      sampler = defaultSampler,
      exporters,
      maxBatchSize = DEFAULT_BATCH_SIZE,
      flushIntervalMs = DEFAULT_FLUSH_INTERVAL_MS,
    } = config

    this.sampler = sampler

    // Build exporter.
    let exporter: SpanExporter
    if (exporters && exporters.length > 0) {
      exporter =
        exporters.length === 1 ? exporters[0] : new CompositeExporter(exporters)
    } else {
      // Default: console in dev, no-op in production.
      const isDev =
        typeof process !== 'undefined' && process.env.NODE_ENV !== 'production'
      exporter = isDev
        ? new ConsoleSpanExporter()
        : { export: async () => {}, shutdown: async () => {} }
    }

    this.processor = new BatchProcessor(exporter, maxBatchSize, flushIntervalMs)
    this.processor.start()
  }

  /**
   * Returns a `Tracer` scoped to the given `library` name.
   * Subsequent calls with the same name return the same instance.
   */
  getTracer(library = DEFAULT_LIBRARY): Tracer {
    const existing = this.tracers.get(library)
    if (existing) return existing
    const tracer = new Tracer(library, this.processor, this.sampler)
    this.tracers.set(library, tracer)
    return tracer
  }

  /** Flush pending spans and shut down all exporters gracefully. */
  async shutdown(): Promise<void> {
    await this.processor.shutdown()
  }

  /** Force-flush all buffered spans without shutting down. */
  async forceFlush(): Promise<void> {
    await this.processor.flush()
  }
}

// ─── Global provider registry ─────────────────────────────────────────────────

let _globalProvider: TracerProvider | null = null

/**
 * Register a `TracerProvider` as the process-wide default.
 * Must be called once at application startup (e.g., in `instrumentation.ts`).
 */
export function registerGlobalProvider(provider: TracerProvider): void {
  _globalProvider = provider
}

/**
 * Returns a `Tracer` from the global provider.
 *
 * Falls back to a no-op `TracerProvider` when no global provider has been
 * registered, so callers never need to guard against `null`.
 */
export function getGlobalTracer(library = DEFAULT_LIBRARY): Tracer {
  if (!_globalProvider) {
    _globalProvider = new TracerProvider()
  }
  return _globalProvider.getTracer(library)
}

/**
 * Returns the global provider, initialising a default one if needed.
 * Useful for calling `shutdown()` / `forceFlush()` from teardown hooks.
 */
export function getGlobalProvider(): TracerProvider {
  if (!_globalProvider) {
    _globalProvider = new TracerProvider()
  }
  return _globalProvider
}
