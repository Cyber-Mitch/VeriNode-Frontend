/**
 * Trace Samplers (#104)
 *
 * Implements two OpenTelemetry-aligned sampling strategies:
 *
 *   1. `AlwaysOnSampler`        — records every trace (100% sample rate).
 *   2. `TraceIdRatioSampler`    — deterministic ratio-based sampling keyed on
 *                                 the 128-bit trace ID.
 *   3. `ParentBasedSampler`     — honours the sampling decision of the parent
 *                                 span when one exists; falls back to a root
 *                                 sampler for new traces.
 *
 * All implementations are pure, stateless, and carry no dependencies beyond
 * the local `types.ts` module.
 */

import type { Sampler, SamplingResult, TraceId } from './types'

// ─── AlwaysOnSampler ──────────────────────────────────────────────────────────

/**
 * Always records the span.  Use during development or when 100% coverage is
 * required (e.g., synthetic canary transactions).
 */
export class AlwaysOnSampler implements Sampler {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  shouldSample(traceId: TraceId, spanName: string): SamplingResult {
    return { shouldSample: true }
  }
}

// ─── AlwaysOffSampler ─────────────────────────────────────────────────────────

/**
 * Never records any span.  Useful as a stub during testing when you want to
 * disable tracing entirely without removing the instrumentation.
 */
export class AlwaysOffSampler implements Sampler {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  shouldSample(traceId: TraceId, spanName: string): SamplingResult {
    return { shouldSample: false }
  }
}

// ─── TraceIdRatioSampler ──────────────────────────────────────────────────────

/**
 * Deterministic ratio-based sampler that uses the first 8 bytes of the
 * trace ID (interpreted as a big-endian unsigned 64-bit integer) to make a
 * consistent sampling decision.
 *
 * A given `traceId` will always produce the same decision for a fixed ratio,
 * ensuring that all spans of a trace are either all recorded or all dropped.
 *
 * `ratio` must be in the range [0, 1].  Values outside this range are clamped.
 *
 * @example
 * const sampler = new TraceIdRatioSampler(0.1) // sample 10% of traces
 */
export class TraceIdRatioSampler implements Sampler {
  private readonly threshold: number

  constructor(ratio: number) {
    const clamped = Math.max(0, Math.min(1, ratio))
    // Compute threshold as a fraction of 2^32 (using only the lower 32 bits
    // of the 64-bit prefix for simplicity while preserving determinism).
    this.threshold = clamped * 0xffffffff
  }

  shouldSample(traceId: TraceId, spanName: string): SamplingResult {
    // spanName is part of the Sampler interface contract; not used by ratio sampling.
    void spanName
    // Parse first 8 hex chars (32 bits) of the traceId.
    const sample = parseInt(traceId.slice(0, 8), 16)
    const shouldSample = sample <= this.threshold
    return {
      shouldSample,
      attributes: shouldSample
        ? { 'sampling.strategy': 'trace_id_ratio', 'sampling.ratio': this.threshold / 0xffffffff }
        : undefined,
    }
  }
}

// ─── ParentBasedSampler ───────────────────────────────────────────────────────

/**
 * Defers the sampling decision to the `parentSampled` flag when a parent
 * context is known.  For new root traces (no parent) it delegates to the
 * provided `rootSampler`.
 *
 * This mirrors the OTel SDK `ParentBased` sampler and is the recommended
 * default for distributed systems because it propagates the sampling decision
 * made at the trace origin.
 */
export class ParentBasedSampler implements Sampler {
  constructor(private readonly rootSampler: Sampler) {}

  shouldSample(
    traceId: TraceId,
    spanName: string,
    parentSampled?: boolean,
  ): SamplingResult {
    if (parentSampled !== undefined) {
      return {
        shouldSample: parentSampled,
        attributes: {
          'sampling.strategy': 'parent_based',
          'sampling.parent_sampled': parentSampled,
        },
      }
    }
    // Root span — defer to root sampler.
    return this.rootSampler.shouldSample(traceId, spanName)
  }
}

// ─── Default export ───────────────────────────────────────────────────────────

/**
 * Default production sampler.
 *
 * - Respects parent sampling decisions for distributed traces.
 * - Falls back to 100% sampling for root spans (conservative default;
 *   override via `NEXT_PUBLIC_TRACE_SAMPLE_RATE` env var in TracerProvider).
 */
export const defaultSampler: Sampler = new ParentBasedSampler(new AlwaysOnSampler())
