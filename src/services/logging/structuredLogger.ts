import { getGlobalTracer } from '@/src/services/tracing'

export type LogSeverity = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal'
export type LogAttributeValue = string | number | boolean | null | undefined | string[] | number[] | boolean[]
export type LogAttributes = Record<string, LogAttributeValue>

export interface StructuredLogRecord {
  timestamp: string
  observedTimestamp: string
  severityText: Uppercase<LogSeverity>
  severityNumber: number
  body: string
  attributes: Record<string, string | number | boolean | string[] | number[] | boolean[]>
  resource: Record<string, string>
  traceId?: string
  spanId?: string
}

export interface LoggerOptions {
  serviceName?: string
  serviceVersion?: string
  environment?: string
  console?: Pick<Console, 'debug' | 'info' | 'warn' | 'error'>
  now?: () => Date
  tracer?: Pick<ReturnType<typeof getGlobalTracer>, 'activeContext'>
}

const SEVERITY_NUMBERS: Record<LogSeverity, number> = {
  trace: 1,
  debug: 5,
  info: 9,
  warn: 13,
  error: 17,
  fatal: 21,
}

function defaultServiceName(): string {
  return process.env.NEXT_PUBLIC_OTEL_SERVICE_NAME ?? 'verinode-frontend'
}

function defaultServiceVersion(): string {
  return process.env.NEXT_PUBLIC_APP_VERSION ?? process.env.npm_package_version ?? '0.1.0'
}

function defaultEnvironment(): string {
  return process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV ?? 'development'
}

function sanitizeAttributes(attributes: LogAttributes = {}): StructuredLogRecord['attributes'] {
  const sanitized: StructuredLogRecord['attributes'] = {}
  for (const [key, value] of Object.entries(attributes)) {
    if (value === null || value === undefined) continue
    sanitized[key] = value
  }
  return sanitized
}

function createLogRecordId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `log_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`
}

function consoleMethod(severity: LogSeverity): 'debug' | 'info' | 'warn' | 'error' {
  if (severity === 'trace' || severity === 'debug') return 'debug'
  if (severity === 'warn') return 'warn'
  if (severity === 'error' || severity === 'fatal') return 'error'
  return 'info'
}

export class StructuredLogger {
  private readonly serviceName: string
  private readonly serviceVersion: string
  private readonly environment: string
  private readonly consoleSink: Pick<Console, 'debug' | 'info' | 'warn' | 'error'>
  private readonly now: () => Date
  private readonly tracer?: Pick<ReturnType<typeof getGlobalTracer>, 'activeContext'>

  constructor(options: LoggerOptions = {}) {
    this.serviceName = options.serviceName ?? defaultServiceName()
    this.serviceVersion = options.serviceVersion ?? defaultServiceVersion()
    this.environment = options.environment ?? defaultEnvironment()
    this.consoleSink = options.console ?? console
    this.now = options.now ?? (() => new Date())
    this.tracer = options.tracer
  }

  log(severity: LogSeverity, body: string, attributes?: LogAttributes): StructuredLogRecord {
    const timestamp = this.now().toISOString()
    const activeContext = (this.tracer ?? getGlobalTracer('verinode-logger')).activeContext()
    const record: StructuredLogRecord = {
      timestamp,
      observedTimestamp: timestamp,
      severityText: severity.toUpperCase() as Uppercase<LogSeverity>,
      severityNumber: SEVERITY_NUMBERS[severity],
      body,
      resource: {
        'service.name': this.serviceName,
        'service.version': this.serviceVersion,
        'deployment.environment.name': this.environment,
        'telemetry.sdk.name': 'verinode-otel',
        'telemetry.sdk.language': 'webjs',
      },
      attributes: {
        'log.record.uid': createLogRecordId(),
        ...sanitizeAttributes(attributes),
      },
    }

    if (activeContext) {
      record.traceId = activeContext.traceId
      record.spanId = activeContext.spanId
      record.attributes['trace.flags'] = activeContext.sampled ? '01' : '00'
    }

    this.consoleSink[consoleMethod(severity)](JSON.stringify(record))
    return record
  }

  trace(body: string, attributes?: LogAttributes): StructuredLogRecord { return this.log('trace', body, attributes) }
  debug(body: string, attributes?: LogAttributes): StructuredLogRecord { return this.log('debug', body, attributes) }
  info(body: string, attributes?: LogAttributes): StructuredLogRecord { return this.log('info', body, attributes) }
  warn(body: string, attributes?: LogAttributes): StructuredLogRecord { return this.log('warn', body, attributes) }
  error(body: string, attributes?: LogAttributes): StructuredLogRecord { return this.log('error', body, attributes) }
  fatal(body: string, attributes?: LogAttributes): StructuredLogRecord { return this.log('fatal', body, attributes) }
}

export const logger = new StructuredLogger()
