/**
 * Next.js Instrumentation Hook — Distributed Tracing Bootstrap (#104)
 *
 * This file is loaded by Next.js once per runtime process (Node.js server and
 * Edge runtime) before any application code runs.  It initialises the global
 * `TracerProvider` so that all server-side spans share a single configured
 * provider.
 *
 * Reference: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 *
 * Environment variables (all optional — sensible defaults apply):
 *   NEXT_PUBLIC_OTEL_EXPORTER_OTLP_ENDPOINT  — OTLP/HTTP collector URL
 *   NEXT_PUBLIC_OTEL_EXPORTER_OTLP_HEADERS   — comma-separated "key=value" pairs
 *   NEXT_PUBLIC_OTEL_SERVICE_NAME             — overrides "verinode-frontend"
 *   NEXT_PUBLIC_OTEL_LOG_LEVEL                — set "debug" to enable console exporter
 *   NEXT_PUBLIC_TRACE_SAMPLE_RATE             — float 0–1, default 1.0 (100%)
 */

export async function register(): Promise<void> {
  const {
    TracerProvider,
    registerGlobalProvider,
    ConsoleSpanExporter,
    OtlpHttpExporter,
    CompositeExporter,
    TraceIdRatioSampler,
    ParentBasedSampler,
    AlwaysOnSampler,
  } = await import('./src/services/tracing')

  // ── Sampler ──────────────────────────────────────────────────────────────

  const rawRate = process.env.NEXT_PUBLIC_TRACE_SAMPLE_RATE
  const sampleRate = rawRate !== undefined ? parseFloat(rawRate) : 1.0
  const rootSampler =
    sampleRate >= 1.0
      ? new AlwaysOnSampler()
      : new TraceIdRatioSampler(Math.max(0, sampleRate))

  const sampler = new ParentBasedSampler(rootSampler)

  // ── Exporters ─────────────────────────────────────────────────────────────

  const exporters = []

  const endpoint = process.env.NEXT_PUBLIC_OTEL_EXPORTER_OTLP_ENDPOINT
  if (endpoint) {
    // Parse optional "key=value,key2=value2" headers string.
    const rawHeaders = process.env.NEXT_PUBLIC_OTEL_EXPORTER_OTLP_HEADERS ?? ''
    const headers: Record<string, string> = {}
    if (rawHeaders) {
      for (const pair of rawHeaders.split(',')) {
        const eqIdx = pair.indexOf('=')
        if (eqIdx > 0) {
          headers[pair.slice(0, eqIdx).trim()] = pair.slice(eqIdx + 1).trim()
        }
      }
    }
    exporters.push(new OtlpHttpExporter({ endpoint, headers }))
  }

  if (
    process.env.NODE_ENV !== 'production' ||
    process.env.NEXT_PUBLIC_OTEL_LOG_LEVEL === 'debug'
  ) {
    exporters.push(new ConsoleSpanExporter())
  }

  const exporter =
    exporters.length === 0
      ? { export: async () => {}, shutdown: async () => {} }
      : exporters.length === 1
        ? exporters[0]
        : new CompositeExporter(exporters)

  // ── Provider registration ─────────────────────────────────────────────────

  const provider = new TracerProvider({
    sampler,
    exporters: [exporter],
  })

  registerGlobalProvider(provider)
}
