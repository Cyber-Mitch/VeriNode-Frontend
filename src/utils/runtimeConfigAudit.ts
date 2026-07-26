/**
 * Runtime configuration auditing and drift detection utilities.
 *
 * The implementation is intentionally deterministic and side-effect free so it
 * can run in critical request paths, workers, or polling hooks without adding
 * network latency. Callers provide the observed runtime config and the approved
 * baseline; this module returns a canonical fingerprint, audited events, drift
 * findings, alert candidates, and rollout/canary decisions.
 */

export type RuntimeConfigValue = string | number | boolean | null | RuntimeConfigObject | RuntimeConfigValue[]
export interface RuntimeConfigObject { [key: string]: RuntimeConfigValue }

export type DriftSeverity = 'info' | 'warning' | 'critical'
export type DriftChangeType = 'added' | 'removed' | 'changed'

export interface RuntimeConfigAuditOptions {
  service: string
  environment: string
  approvedBy: string
  observedAt?: number
  sensitiveKeys?: string[]
  criticalKeys?: string[]
}

export interface ConfigDriftFinding {
  path: string
  expected?: RuntimeConfigValue
  actual?: RuntimeConfigValue
  changeType: DriftChangeType
  severity: DriftSeverity
  message: string
}

export interface RuntimeConfigAuditResult {
  service: string
  environment: string
  approvedBy: string
  observedAt: number
  baselineFingerprint: string
  runtimeFingerprint: string
  driftDetected: boolean
  findings: ConfigDriftFinding[]
  auditEvents: RuntimeConfigAuditEvent[]
  metrics: RuntimeConfigAuditMetrics
}

export interface RuntimeConfigAuditEvent {
  eventType: 'runtime_config_audited' | 'runtime_config_drift_detected'
  service: string
  environment: string
  observedAt: number
  fingerprint: string
  severity: DriftSeverity
  message: string
  findingPath?: string
}

export interface RuntimeConfigAuditMetrics {
  totalFindings: number
  criticalFindings: number
  warningFindings: number
  infoFindings: number
}

export interface DriftAlert {
  id: string
  severity: DriftSeverity
  title: string
  description: string
  labels: Record<string, string>
}

export interface CanaryAnalysisInput {
  baseline: RuntimeConfigObject
  candidate: RuntimeConfigObject
  service: string
  environment: string
  approvedBy: string
  maxCriticalFindings?: number
  maxWarningFindings?: number
  minHealthyPercent?: number
  observedHealthyPercent: number
  observedAt?: number
  criticalKeys?: string[]
  sensitiveKeys?: string[]
}

export interface CanaryAnalysisResult {
  decision: 'promote' | 'rollback' | 'hold'
  reasons: string[]
  audit: RuntimeConfigAuditResult
}

const DEFAULT_SENSITIVE_KEYS = ['password', 'secret', 'token', 'key', 'credential']
const DEFAULT_CRITICAL_KEYS = ['endpoint', 'rpc', 'url', 'contract', 'network', 'chainId', 'featureFlags']

export function auditRuntimeConfig(
  baseline: RuntimeConfigObject,
  runtime: RuntimeConfigObject,
  options: RuntimeConfigAuditOptions,
): RuntimeConfigAuditResult {
  const observedAt = options.observedAt ?? Date.now()
  const sensitiveKeys = options.sensitiveKeys ?? DEFAULT_SENSITIVE_KEYS
  const criticalKeys = options.criticalKeys ?? DEFAULT_CRITICAL_KEYS
  const findings = detectConfigDrift(baseline, runtime, { sensitiveKeys, criticalKeys })
  const runtimeFingerprint = fingerprintConfig(runtime, sensitiveKeys)
  const baselineFingerprint = fingerprintConfig(baseline, sensitiveKeys)
  const metrics = summarizeFindings(findings)

  return {
    service: options.service,
    environment: options.environment,
    approvedBy: options.approvedBy,
    observedAt,
    baselineFingerprint,
    runtimeFingerprint,
    driftDetected: findings.length > 0,
    findings,
    auditEvents: buildAuditEvents(options.service, options.environment, observedAt, runtimeFingerprint, findings),
    metrics,
  }
}

export function detectConfigDrift(
  baseline: RuntimeConfigObject,
  runtime: RuntimeConfigObject,
  options: Pick<RuntimeConfigAuditOptions, 'sensitiveKeys' | 'criticalKeys'> = {},
): ConfigDriftFinding[] {
  const sensitiveKeys = options.sensitiveKeys ?? DEFAULT_SENSITIVE_KEYS
  const criticalKeys = options.criticalKeys ?? DEFAULT_CRITICAL_KEYS
  const findings: ConfigDriftFinding[] = []
  const paths = new Set([...flattenConfig(baseline).keys(), ...flattenConfig(runtime).keys()])
  const flatBaseline = flattenConfig(baseline)
  const flatRuntime = flattenConfig(runtime)

  for (const path of [...paths].sort()) {
    const hasExpected = flatBaseline.has(path)
    const hasActual = flatRuntime.has(path)
    const expected = flatBaseline.get(path)
    const actual = flatRuntime.get(path)
    if (hasExpected && hasActual && stableStringify(expected) === stableStringify(actual)) continue

    const changeType: DriftChangeType = hasExpected && hasActual ? 'changed' : hasExpected ? 'removed' : 'added'
    const severity = classifySeverity(path, changeType, criticalKeys)
    const redactedExpected = redactValue(path, expected, sensitiveKeys)
    const redactedActual = redactValue(path, actual, sensitiveKeys)

    findings.push({
      path,
      expected: redactedExpected,
      actual: redactedActual,
      changeType,
      severity,
      message: `${path} ${changeType}${severity === 'critical' ? ' in critical configuration' : ''}`,
    })
  }

  return findings
}

export function fingerprintConfig(config: RuntimeConfigObject, sensitiveKeys = DEFAULT_SENSITIVE_KEYS): string {
  const redacted = redactConfig(config, sensitiveKeys)
  return fnv1a64(stableStringify(redacted))
}

export function buildDriftAlerts(audit: RuntimeConfigAuditResult): DriftAlert[] {
  return audit.findings
    .filter((finding) => finding.severity !== 'info')
    .map((finding) => ({
      id: `${audit.service}:${audit.environment}:${finding.path}:${audit.runtimeFingerprint}`,
      severity: finding.severity,
      title: `Runtime configuration drift in ${audit.service}`,
      description: finding.message,
      labels: { service: audit.service, environment: audit.environment, path: finding.path },
    }))
}

export function analyzeCanary(input: CanaryAnalysisInput): CanaryAnalysisResult {
  const audit = auditRuntimeConfig(input.baseline, input.candidate, input)
  const maxCritical = input.maxCriticalFindings ?? 0
  const maxWarning = input.maxWarningFindings ?? 2
  const minHealthy = input.minHealthyPercent ?? 99.99
  const reasons: string[] = []

  if (audit.metrics.criticalFindings > maxCritical) reasons.push(`critical drift findings ${audit.metrics.criticalFindings} exceed ${maxCritical}`)
  if (audit.metrics.warningFindings > maxWarning) reasons.push(`warning drift findings ${audit.metrics.warningFindings} exceed ${maxWarning}`)
  if (input.observedHealthyPercent < minHealthy) reasons.push(`health ${input.observedHealthyPercent}% is below ${minHealthy}%`)

  return { decision: reasons.some((r) => r.includes('critical') || r.includes('health')) ? 'rollback' : reasons.length ? 'hold' : 'promote', reasons, audit }
}

function summarizeFindings(findings: ConfigDriftFinding[]): RuntimeConfigAuditMetrics {
  return {
    totalFindings: findings.length,
    criticalFindings: findings.filter((f) => f.severity === 'critical').length,
    warningFindings: findings.filter((f) => f.severity === 'warning').length,
    infoFindings: findings.filter((f) => f.severity === 'info').length,
  }
}

function buildAuditEvents(service: string, environment: string, observedAt: number, fingerprint: string, findings: ConfigDriftFinding[]): RuntimeConfigAuditEvent[] {
  const events: RuntimeConfigAuditEvent[] = [{ eventType: 'runtime_config_audited', service, environment, observedAt, fingerprint, severity: findings.some((f) => f.severity === 'critical') ? 'critical' : findings.length ? 'warning' : 'info', message: 'Runtime configuration audited' }]
  findings.forEach((finding) => events.push({ eventType: 'runtime_config_drift_detected', service, environment, observedAt, fingerprint, severity: finding.severity, message: finding.message, findingPath: finding.path }))
  return events
}

function flattenConfig(config: RuntimeConfigValue, prefix = ''): Map<string, RuntimeConfigValue> {
  const out = new Map<string, RuntimeConfigValue>()
  if (!isPlainObject(config)) {
    out.set(prefix || '$', config)
    return out
  }
  for (const key of Object.keys(config).sort()) {
    const path = prefix ? `${prefix}.${key}` : key
    const value = config[key]
    if (isPlainObject(value)) flattenConfig(value, path).forEach((v, k) => out.set(k, v))
    else out.set(path, value)
  }
  return out
}

function redactConfig(value: RuntimeConfigValue, sensitiveKeys: string[]): RuntimeConfigValue {
  if (Array.isArray(value)) return value.map((item) => redactConfig(item, sensitiveKeys))
  if (!isPlainObject(value)) return value
  return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, isSensitivePath(key, sensitiveKeys) ? '[REDACTED]' : redactConfig(item, sensitiveKeys)]))
}

function redactValue(path: string, value: RuntimeConfigValue | undefined, sensitiveKeys: string[]): RuntimeConfigValue | undefined {
  return value === undefined ? undefined : isSensitivePath(path, sensitiveKeys) ? '[REDACTED]' : value
}

function classifySeverity(path: string, changeType: DriftChangeType, criticalKeys: string[]): DriftSeverity {
  if (criticalKeys.some((key) => path.toLowerCase().includes(key.toLowerCase()))) return 'critical'
  return changeType === 'added' ? 'info' : 'warning'
}

function isSensitivePath(path: string, sensitiveKeys: string[]): boolean {
  return sensitiveKeys.some((key) => path.toLowerCase().includes(key.toLowerCase()))
}

function isPlainObject(value: RuntimeConfigValue): value is RuntimeConfigObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function stableStringify(value: RuntimeConfigValue | undefined): string {
  if (value === undefined) return 'undefined'
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  if (isPlainObject(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`
  return JSON.stringify(value)
}

function fnv1a64(input: string): string {
  let hash = 0x811c9dc5

  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }

  return `0x${hash.toString(16).padStart(8, '0')}`
}
