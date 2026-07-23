/**
 * Distributed Tracing — Unit Tests (#104)
 *
 * Covers:
 *   - ID generation (format, uniqueness, invalidity guard)
 *   - W3C traceparent parsing / serialisation
 *   - W3C tracestate parsing / serialisation
 *   - Context injection / extraction helpers
 *   - Sampler implementations
 *   - SpanImpl lifecycle (attributes, events, status, end guard)
 *   - Tracer / TracerProvider wiring
 *   - Exporter (ConsoleSpanExporter, CompositeExporter)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import { generateTraceId, generateSpanId } from './idGenerator'
import {
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
import {
  AlwaysOnSampler,
  AlwaysOffSampler,
  TraceIdRatioSampler,
  ParentBasedSampler,
} from './sampler'
import { SpanImpl } from './span'
import {
  TracerProvider,
  Tracer,
  registerGlobalProvider,
  getGlobalTracer,
  getGlobalProvider,
} from './tracer'
import { ConsoleSpanExporter, CompositeExporter } from './exporter'
import type { ReadableSpan, TraceContext } from './types'

// ─── ID Generator ─────────────────────────────────────────────────────────────

describe('generateTraceId', () => {
  it('produces a 32-char lowercase hex string', () => {
    const id = generateTraceId()
    expect(id).toMatch(/^[0-9a-f]{32}$/)
  })

  it('never returns the all-zero invalid value', () => {
    for (let i = 0; i < 100; i++) {
      expect(generateTraceId()).not.toBe('00000000000000000000000000000000')
    }
  })

  it('generates unique values', () => {
    const ids = new Set(Array.from({ length: 500 }, generateTraceId))
    expect(ids.size).toBe(500)
  })
})

describe('generateSpanId', () => {
  it('produces a 16-char lowercase hex string', () => {
    const id = generateSpanId()
    expect(id).toMatch(/^[0-9a-f]{16}$/)
  })

  it('never returns the all-zero invalid value', () => {
    for (let i = 0; i < 100; i++) {
      expect(generateSpanId()).not.toBe('0000000000000000')
    }
  })

  it('generates unique values', () => {
    const ids = new Set(Array.from({ length: 500 }, generateSpanId))
    expect(ids.size).toBe(500)
  })
})

// ─── parseTraceParent ─────────────────────────────────────────────────────────

describe('parseTraceParent', () => {
  const VALID = '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01'

  it('parses a valid traceparent', () => {
    const tp = parseTraceParent(VALID)
    expect(tp).not.toBeNull()
    expect(tp!.version).toBe('00')
    expect(tp!.traceId).toBe('4bf92f3577b34da6a3ce929d0e0e4736')
    expect(tp!.parentId).toBe('00f067aa0ba902b7')
    expect(tp!.flags).toBe('01')
  })

  it('returns null for empty string', () => {
    expect(parseTraceParent('')).toBeNull()
  })

  it('returns null for version ff (reserved)', () => {
    expect(parseTraceParent('ff-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01')).toBeNull()
  })

  it('returns null for all-zero traceId', () => {
    expect(parseTraceParent('00-00000000000000000000000000000000-00f067aa0ba902b7-01')).toBeNull()
  })

  it('returns null for all-zero parentId', () => {
    expect(parseTraceParent('00-4bf92f3577b34da6a3ce929d0e0e4736-0000000000000000-01')).toBeNull()
  })

  it('returns null for malformed input', () => {
    expect(parseTraceParent('not-a-traceparent')).toBeNull()
    expect(parseTraceParent('00-short-00f067aa0ba902b7-01')).toBeNull()
  })

  it('accepts future-version headers (ignores trailing data)', () => {
    const future = '01-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01-extra'
    const tp = parseTraceParent(future)
    expect(tp).not.toBeNull()
  })
})

describe('serializeTraceParent', () => {
  it('round-trips a parsed traceparent', () => {
    const raw = '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01'
    const tp = parseTraceParent(raw)!
    expect(serializeTraceParent(tp)).toBe(raw)
  })
})

describe('isSampled', () => {
  it('returns true for flags 01', () => expect(isSampled('01')).toBe(true))
  it('returns false for flags 00', () => expect(isSampled('00')).toBe(false))
  it('returns true for flags 03 (bit 0 set)', () => expect(isSampled('03')).toBe(true))
})

describe('buildTraceParent', () => {
  it('includes sampled flag when sampled=true', () => {
    const ctx: TraceContext = {
      traceId: '4bf92f3577b34da6a3ce929d0e0e4736',
      spanId: '00f067aa0ba902b7',
      traceState: [],
      sampled: true,
    }
    expect(buildTraceParent(ctx)).toBe('00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01')
  })

  it('includes unsampled flag when sampled=false', () => {
    const ctx: TraceContext = {
      traceId: '4bf92f3577b34da6a3ce929d0e0e4736',
      spanId: '00f067aa0ba902b7',
      traceState: [],
      sampled: false,
    }
    expect(buildTraceParent(ctx)).toBe('00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-00')
  })
})

// ─── parseTraceState / serializeTraceState ────────────────────────────────────

describe('parseTraceState', () => {
  it('parses a single entry', () => {
    const state = parseTraceState('vn=abc123-1')
    expect(state).toHaveLength(1)
    expect(state[0]).toEqual({ key: 'vn', value: 'abc123-1' })
  })

  it('parses multiple comma-separated entries', () => {
    const state = parseTraceState('vn=abc-1,rojo=00f0')
    expect(state).toHaveLength(2)
    expect(state[0].key).toBe('vn')
    expect(state[1].key).toBe('rojo')
  })

  it('deduplicates keys (first occurrence wins)', () => {
    const state = parseTraceState('vn=first,vn=second')
    expect(state).toHaveLength(1)
    expect(state[0].value).toBe('first')
  })

  it('returns empty array for empty / whitespace string', () => {
    expect(parseTraceState('')).toHaveLength(0)
    expect(parseTraceState('   ')).toHaveLength(0)
  })

  it('silently drops entries with invalid keys', () => {
    const state = parseTraceState('UPPER=val,valid=ok')
    expect(state).toHaveLength(1)
    expect(state[0].key).toBe('valid')
  })

  it('caps at 32 entries', () => {
    const raw = Array.from({ length: 40 }, (_, i) => `k${i}=v`).join(',')
    const state = parseTraceState(raw)
    expect(state.length).toBeLessThanOrEqual(32)
  })
})

describe('serializeTraceState', () => {
  it('serialises entries as comma-separated key=value pairs', () => {
    const state = [{ key: 'vn', value: 'abc-1' }, { key: 'rojo', value: '00f0' }]
    expect(serializeTraceState(state)).toBe('vn=abc-1,rojo=00f0')
  })

  it('returns empty string for empty state', () => {
    expect(serializeTraceState([])).toBe('')
  })
})

describe('injectVeriNodeEntry', () => {
  it('prepends the vn entry when none exists', () => {
    const state = injectVeriNodeEntry([], 'deadbeef01234567', true)
    expect(state[0]).toEqual({ key: 'vn', value: 'deadbeef01234567-1' })
  })

  it('replaces an existing vn entry and moves it to position 0', () => {
    const existing = [{ key: 'vn', value: 'old-0' }, { key: 'other', value: 'x' }]
    const state = injectVeriNodeEntry(existing, 'newspan0000000001', false)
    expect(state[0]).toEqual({ key: 'vn', value: 'newspan0000000001-0' })
    expect(state.find((e) => e.key === 'other')).toBeDefined()
    expect(state.filter((e) => e.key === 'vn')).toHaveLength(1)
  })
})

// ─── Context helpers ──────────────────────────────────────────────────────────

describe('extractContext', () => {
  it('extracts a valid context from traceparent + tracestate', () => {
    const ctx = extractContext(
      '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
      'vn=abc-1',
    )
    expect(ctx).not.toBeNull()
    expect(ctx!.traceId).toBe('4bf92f3577b34da6a3ce929d0e0e4736')
    expect(ctx!.spanId).toBe('00f067aa0ba902b7')
    expect(ctx!.sampled).toBe(true)
    expect(ctx!.traceState[0].key).toBe('vn')
  })

  it('returns null for missing traceparent', () => {
    expect(extractContext(null, null)).toBeNull()
    expect(extractContext(undefined, undefined)).toBeNull()
  })

  it('returns null for invalid traceparent', () => {
    expect(extractContext('garbage', null)).toBeNull()
  })
})

describe('injectContext', () => {
  it('produces valid traceparent and non-empty tracestate', () => {
    const ctx: TraceContext = {
      traceId: '4bf92f3577b34da6a3ce929d0e0e4736',
      spanId: '00f067aa0ba902b7',
      traceState: [],
      sampled: true,
    }
    const { traceparent, tracestate } = injectContext(ctx)
    expect(traceparent).toBe('00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01')
    expect(tracestate).toContain('vn=')
  })
})

describe('injectHeaders / extractFromHeaders', () => {
  it('round-trips context through Headers', () => {
    const ctx: TraceContext = {
      traceId: '4bf92f3577b34da6a3ce929d0e0e4736',
      spanId: '00f067aa0ba902b7',
      traceState: [],
      sampled: true,
    }
    const headers = injectHeaders(ctx)
    const extracted = extractFromHeaders(headers)
    expect(extracted).not.toBeNull()
    expect(extracted!.traceId).toBe(ctx.traceId)
    expect(extracted!.sampled).toBe(true)
  })

  it('merges with existing headers without mutation', () => {
    const ctx: TraceContext = {
      traceId: '4bf92f3577b34da6a3ce929d0e0e4736',
      spanId: '00f067aa0ba902b7',
      traceState: [],
      sampled: false,
    }
    const original = new Headers({ 'x-custom': 'value' })
    const headers = injectHeaders(ctx, original)
    expect(headers.get('x-custom')).toBe('value')
    expect(headers.get('traceparent')).toContain('4bf92f3577b34da6a3ce929d0e0e4736')
    // Original must not be mutated
    expect(original.has('traceparent')).toBe(false)
  })
})

// ─── Samplers ─────────────────────────────────────────────────────────────────

describe('AlwaysOnSampler', () => {
  it('always samples', () => {
    const s = new AlwaysOnSampler()
    expect(s.shouldSample('any', 'op').shouldSample).toBe(true)
  })
})

describe('AlwaysOffSampler', () => {
  it('never samples', () => {
    const s = new AlwaysOffSampler()
    expect(s.shouldSample('any', 'op').shouldSample).toBe(false)
  })
})

describe('TraceIdRatioSampler', () => {
  it('samples 100% at ratio 1.0', () => {
    const s = new TraceIdRatioSampler(1.0)
    // All trace IDs start with 0xffffffff or less
    for (let i = 0; i < 20; i++) {
      expect(s.shouldSample(generateTraceId(), 'op').shouldSample).toBe(true)
    }
  })

  it('samples 0% at ratio 0.0', () => {
    const s = new TraceIdRatioSampler(0.0)
    for (let i = 0; i < 20; i++) {
      expect(s.shouldSample(generateTraceId(), 'op').shouldSample).toBe(false)
    }
  })

  it('is deterministic for the same traceId', () => {
    const s = new TraceIdRatioSampler(0.5)
    const traceId = generateTraceId()
    const first = s.shouldSample(traceId, 'op').shouldSample
    for (let i = 0; i < 10; i++) {
      expect(s.shouldSample(traceId, 'op').shouldSample).toBe(first)
    }
  })

  it('clamps ratio below 0 to 0', () => {
    const s = new TraceIdRatioSampler(-0.5)
    expect(s.shouldSample(generateTraceId(), 'op').shouldSample).toBe(false)
  })

  it('clamps ratio above 1 to 1', () => {
    const s = new TraceIdRatioSampler(1.5)
    expect(s.shouldSample(generateTraceId(), 'op').shouldSample).toBe(true)
  })
})

describe('ParentBasedSampler', () => {
  it('uses parent decision when parentSampled=true', () => {
    const s = new ParentBasedSampler(new AlwaysOffSampler())
    expect(
      (s as unknown as { shouldSample(t: string, n: string, p: boolean): { shouldSample: boolean } })
        .shouldSample('tid', 'op', true).shouldSample
    ).toBe(true)
  })

  it('uses parent decision when parentSampled=false', () => {
    const s = new ParentBasedSampler(new AlwaysOnSampler())
    expect(
      (s as unknown as { shouldSample(t: string, n: string, p: boolean): { shouldSample: boolean } })
        .shouldSample('tid', 'op', false).shouldSample
    ).toBe(false)
  })

  it('falls back to root sampler when no parent', () => {
    const s = new ParentBasedSampler(new AlwaysOffSampler())
    expect(s.shouldSample('tid', 'op').shouldSample).toBe(false)
  })
})

// ─── SpanImpl ─────────────────────────────────────────────────────────────────

function makeSpan(overrides?: Partial<ConstructorParameters<typeof SpanImpl>[0]>): SpanImpl {
  const collected: ReadableSpan[] = []
  return new SpanImpl({
    traceId: '4bf92f3577b34da6a3ce929d0e0e4736',
    spanId: '00f067aa0ba902b7',
    parentSpanId: null,
    name: 'test-span',
    kind: 'INTERNAL',
    startTimeMs: 1000,
    traceState: [],
    instrumentationLibrary: 'test',
    onEnd: (s) => collected.push(s),
    ...overrides,
  })
}

describe('SpanImpl', () => {
  it('starts not ended', () => {
    const span = makeSpan()
    expect(span.isEnded).toBe(false)
  })

  it('sets and reads attributes', () => {
    const span = makeSpan()
    span.setAttribute('key', 'value')
    span.setAttributes({ num: 42, flag: true })
    const r = span.toReadable()
    expect(r.attributes['key']).toBe('value')
    expect(r.attributes['num']).toBe(42)
    expect(r.attributes['flag']).toBe(true)
  })

  it('ignores setAttribute after end', () => {
    const span = makeSpan()
    span.end(2000)
    span.setAttribute('late', 'value')
    expect(span.toReadable().attributes['late']).toBeUndefined()
  })

  it('records events with timestamps', () => {
    const span = makeSpan()
    span.addEvent('cache-miss', { key: 'x' })
    const r = span.toReadable()
    expect(r.events).toHaveLength(1)
    expect(r.events[0].name).toBe('cache-miss')
    expect(r.events[0].attributes!['key']).toBe('x')
    expect(typeof r.events[0].timestampMs).toBe('number')
  })

  it('sets status OK then cannot downgrade', () => {
    const span = makeSpan()
    span.setStatus('OK')
    span.setStatus('ERROR', 'late error')
    expect(span.toReadable().status).toBe('OK')
  })

  it('sets ERROR status with message', () => {
    const span = makeSpan()
    span.setStatus('ERROR', 'something went wrong')
    const r = span.toReadable()
    expect(r.status).toBe('ERROR')
    expect(r.statusMessage).toBe('something went wrong')
  })

  it('end() records endTimeMs and calls onEnd', () => {
    const collected: ReadableSpan[] = []
    const span = new SpanImpl({
      traceId: '4bf92f3577b34da6a3ce929d0e0e4736',
      spanId: '00f067aa0ba902b7',
      parentSpanId: null,
      name: 'test',
      kind: 'INTERNAL',
      startTimeMs: 1000,
      traceState: [],
      instrumentationLibrary: 'test',
      onEnd: (s) => collected.push(s),
    })
    span.end(2500)
    expect(span.isEnded).toBe(true)
    expect(collected).toHaveLength(1)
    expect(collected[0].endTimeMs).toBe(2500)
  })

  it('calling end() twice is a no-op', () => {
    const collected: ReadableSpan[] = []
    const span = new SpanImpl({
      traceId: '4bf92f3577b34da6a3ce929d0e0e4736',
      spanId: '00f067aa0ba902b7',
      parentSpanId: null,
      name: 'test',
      kind: 'INTERNAL',
      startTimeMs: 1000,
      traceState: [],
      instrumentationLibrary: 'test',
      onEnd: (s) => collected.push(s),
    })
    span.end(2000)
    span.end(3000)
    expect(collected).toHaveLength(1)
    expect(collected[0].endTimeMs).toBe(2000)
  })

  it('toReadable returns immutable copies of attributes and events', () => {
    const span = makeSpan()
    span.setAttribute('x', 1)
    const r1 = span.toReadable()
    r1.attributes['x'] = 999
    const r2 = span.toReadable()
    expect(r2.attributes['x']).toBe(1)
  })
})

// ─── Tracer / TracerProvider ──────────────────────────────────────────────────

describe('Tracer', () => {
  let collected: ReadableSpan[]
  let provider: TracerProvider

  beforeEach(() => {
    collected = []
    provider = new TracerProvider({
      exporters: [{ export: async (s) => { collected.push(...s) }, shutdown: async () => {} }],
      flushIntervalMs: 999999, // disable auto-flush in tests
    })
  })

  afterEach(async () => {
    await provider.shutdown()
  })

  it('startSpan creates a root span when no context is active', () => {
    const tracer = provider.getTracer('test')
    const span = tracer.startSpan('root-op')
    expect(span.parentSpanId).toBeNull()
    span.end()
  })

  it('startSpan links to explicit parentContext', () => {
    const tracer = provider.getTracer('test')
    const parentCtx: TraceContext = {
      traceId: '4bf92f3577b34da6a3ce929d0e0e4736',
      spanId: 'aabbccdd11223344',
      traceState: [],
      sampled: true,
    }
    const child = tracer.startSpan('child', { parentContext: parentCtx })
    expect(child.traceId).toBe('4bf92f3577b34da6a3ce929d0e0e4736')
    expect(child.parentSpanId).toBe('aabbccdd11223344')
    child.end()
  })

  it('withSpan auto-ends the span and sets OK on success', async () => {
    const tracer = provider.getTracer('test')
    tracer.withSpan('op', {}, (span) => {
      span.setAttribute('x', 1)
    })
    await provider.forceFlush()
    expect(collected).toHaveLength(1)
    expect(collected[0].status).toBe('OK')
    expect(collected[0].attributes['x']).toBe(1)
  })

  it('withSpan sets ERROR on thrown exception and re-throws', async () => {
    const tracer = provider.getTracer('test')
    expect(() =>
      tracer.withSpan('failing', {}, () => {
        throw new Error('boom')
      })
    ).toThrow('boom')
    await provider.forceFlush()
    expect(collected[0].status).toBe('ERROR')
    expect(collected[0].statusMessage).toBe('boom')
  })

  it('withSpanAsync awaits and sets OK', async () => {
    const tracer = provider.getTracer('test')
    await tracer.withSpanAsync('async-op', {}, async (span) => {
      span.setAttribute('async', true)
    })
    await provider.forceFlush()
    expect(collected[0].status).toBe('OK')
    expect(collected[0].attributes['async']).toBe(true)
  })

  it('withSpanAsync sets ERROR on rejection', async () => {
    const tracer = provider.getTracer('test')
    await expect(
      tracer.withSpanAsync('failing-async', {}, async () => {
        throw new Error('async boom')
      })
    ).rejects.toThrow('async boom')
    await provider.forceFlush()
    expect(collected[0].status).toBe('ERROR')
  })

  it('nested withSpan creates parent-child relationship', async () => {
    const tracer = provider.getTracer('test')
    tracer.withSpan('parent', {}, () => {
      tracer.withSpan('child', {}, (s) => s.setAttribute('nested', true))
    })
    await provider.forceFlush()
    expect(collected).toHaveLength(2)
    const child = collected.find((s) => s.name === 'child')!
    const parent = collected.find((s) => s.name === 'parent')!
    expect(child.parentSpanId).toBe(parent.spanId)
    expect(child.traceId).toBe(parent.traceId)
  })

  it('getTracer with same name returns the same instance', () => {
    const t1 = provider.getTracer('lib-a')
    const t2 = provider.getTracer('lib-a')
    expect(t1).toBe(t2)
  })
})

// ─── getGlobalTracer / registerGlobalProvider ─────────────────────────────────

describe('global provider', () => {
  afterEach(async () => {
    // Reset global by shutting down and re-bootstrapping lazily.
    try { await getGlobalProvider().shutdown() } catch { /* noop */ }
    // Force reset to null by calling register with a fresh provider.
    registerGlobalProvider(new TracerProvider())
  })

  it('getGlobalTracer returns a Tracer instance', () => {
    const tracer = getGlobalTracer()
    expect(tracer).toBeInstanceOf(Tracer)
  })

  it('registerGlobalProvider replaces the global provider', () => {
    const collected: ReadableSpan[] = []
    const customProvider = new TracerProvider({
      exporters: [{ export: async (s) => { collected.push(...s) }, shutdown: async () => {} }],
      flushIntervalMs: 999999,
    })
    registerGlobalProvider(customProvider)
    const tracer = getGlobalTracer('custom')
    tracer.withSpan('test-global', {}, () => {})
    return customProvider.forceFlush().then(() => {
      expect(collected.some((s) => s.name === 'test-global')).toBe(true)
    })
  })
})

// ─── ConsoleSpanExporter ──────────────────────────────────────────────────────

describe('ConsoleSpanExporter', () => {
  it('logs spans to console.debug without throwing', async () => {
    const spy = vi.spyOn(console, 'debug').mockImplementation(() => {})
    const exporter = new ConsoleSpanExporter()
    const span: ReadableSpan = {
      traceId: '4bf92f3577b34da6a3ce929d0e0e4736',
      spanId: '00f067aa0ba902b7',
      parentSpanId: null,
      name: 'console-test',
      kind: 'CLIENT',
      startTimeMs: 1000,
      endTimeMs: 1050,
      status: 'OK',
      attributes: { 'http.method': 'GET' },
      events: [],
      traceState: [],
      instrumentationLibrary: 'test',
    }
    await expect(exporter.export([span])).resolves.toBeUndefined()
    expect(spy).toHaveBeenCalledOnce()
    spy.mockRestore()
  })

  it('shutdown resolves without error', async () => {
    const exporter = new ConsoleSpanExporter()
    await expect(exporter.shutdown()).resolves.toBeUndefined()
  })
})

// ─── CompositeExporter ────────────────────────────────────────────────────────

describe('CompositeExporter', () => {
  it('fans out to all child exporters', async () => {
    const results: string[] = []
    const a = { export: async () => { results.push('a') }, shutdown: async () => {} }
    const b = { export: async () => { results.push('b') }, shutdown: async () => {} }
    const composite = new CompositeExporter([a, b])
    await composite.export([])
    expect(results).toContain('a')
    expect(results).toContain('b')
  })

  it('does not propagate errors from one exporter to another', async () => {
    const results: string[] = []
    const failing = {
      export: async () => { throw new Error('exporter failure') },
      shutdown: async () => {},
    }
    const succeeding = {
      export: async () => { results.push('ok') },
      shutdown: async () => {},
    }
    const composite = new CompositeExporter([failing, succeeding])
    await expect(composite.export([])).resolves.toBeUndefined()
    expect(results).toContain('ok')
  })

  it('shuts down all child exporters', async () => {
    const shutdowns: string[] = []
    const a = { export: async () => {}, shutdown: async () => { shutdowns.push('a') } }
    const b = { export: async () => {}, shutdown: async () => { shutdowns.push('b') } }
    const composite = new CompositeExporter([a, b])
    await composite.shutdown()
    expect(shutdowns).toContain('a')
    expect(shutdowns).toContain('b')
  })
})
