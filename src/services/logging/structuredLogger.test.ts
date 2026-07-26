import { describe, expect, it, vi } from 'vitest'
import { StructuredLogger } from './structuredLogger'

describe('StructuredLogger', () => {
  it('emits OpenTelemetry-aligned JSON records with resource and severity fields', () => {
    const info = vi.fn()
    const logger = new StructuredLogger({
      serviceName: 'verinode-test',
      serviceVersion: '1.2.3',
      environment: 'test',
      now: () => new Date('2026-07-25T00:00:00.000Z'),
      console: { debug: vi.fn(), info, warn: vi.fn(), error: vi.fn() },
      tracer: { activeContext: () => null },
    })

    const record = logger.info('wallet connected', {
      'event.name': 'wallet.connected',
      'user.id': 'pubkey-123',
      omitted: undefined,
    })

    expect(record).toMatchObject({
      timestamp: '2026-07-25T00:00:00.000Z',
      observedTimestamp: '2026-07-25T00:00:00.000Z',
      severityText: 'INFO',
      severityNumber: 9,
      body: 'wallet connected',
      resource: {
        'service.name': 'verinode-test',
        'service.version': '1.2.3',
        'deployment.environment.name': 'test',
        'telemetry.sdk.name': 'verinode-otel',
        'telemetry.sdk.language': 'webjs',
      },
      attributes: {
        'event.name': 'wallet.connected',
        'user.id': 'pubkey-123',
      },
    })
    expect(record.attributes).not.toHaveProperty('omitted')
    expect(record.attributes['log.record.uid']).toEqual(expect.any(String))
    expect(info).toHaveBeenCalledWith(JSON.stringify(record))
  })

  it('correlates records with the active trace context', () => {
    const warn = vi.fn()
    const logger = new StructuredLogger({
      console: { debug: vi.fn(), info: vi.fn(), warn, error: vi.fn() },
      tracer: {
        activeContext: () => ({
          traceId: '4bf92f3577b34da6a3ce929d0e0e4736',
          spanId: '00f067aa0ba902b7',
          sampled: true,
          traceState: [],
        }),
      },
    })

    const record = logger.warn('retry scheduled', { 'event.name': 'retry.scheduled' })

    expect(record.traceId).toBe('4bf92f3577b34da6a3ce929d0e0e4736')
    expect(record.spanId).toBe('00f067aa0ba902b7')
    expect(record.attributes['trace.flags']).toBe('01')
    expect(warn).toHaveBeenCalledWith(JSON.stringify(record))
  })
})
