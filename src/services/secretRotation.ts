import type {
  RotationEvent,
  RotationEventListener,
  RotationMetrics,
  RotationPolicy,
  SecretKind,
  SecretRecord,
  SecretVersion,
} from '../types/secrets';

const DEFAULT_POLICY: RotationPolicy = {
  rotationIntervalMs: 24 * 60 * 60 * 1000,
  maxVersions: 3,
  overlapMs: 60 * 60 * 1000,
};

function generateId(prefix: string): string {
  const rand =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2) + Date.now().toString(36);
  return `${prefix}_${rand}`;
}

export interface SecretStoreBackend {
  read(key: string): Promise<SecretRecord | null> | SecretRecord | null;
  write(record: SecretRecord): Promise<void> | void;
  list(): Promise<string[]> | string[];
}

export interface SecretGenerator {
  generate(kind: SecretKind, key: string): Promise<string> | string;
}

export interface SecretRotationServiceOptions {
  policy?: Partial<RotationPolicy>;
  backend?: SecretStoreBackend;
  generator?: SecretGenerator;
  clock?: () => number;
}

export class SecretRotationService {
  private readonly policy: RotationPolicy;
  private readonly backend: SecretStoreBackend;
  private readonly generator: SecretGenerator;
  private readonly clock: () => number;
  private readonly listeners = new Set<RotationEventListener>();
  private readonly metrics: RotationMetrics = {
    totalRotations: 0,
    failedRotations: 0,
    activeSecrets: 0,
    expiredSecrets: 0,
    lastRotationLatencyMs: null,
  };
  private readonly records = new Map<string, SecretRecord>();

  constructor(options: SecretRotationServiceOptions = {}) {
    this.policy = { ...DEFAULT_POLICY, ...(options.policy ?? {}) };
    this.clock = options.clock ?? (() => Date.now());
    this.backend = options.backend ?? this.createDefaultBackend();
    this.generator =
      options.generator ?? {
        generate: (kind, key) => generateId(`${kind}:${key}`),
      };
  }

  private createDefaultBackend(): SecretStoreBackend {
    return {
      read: (key) => this.records.get(key) ?? null,
      write: (record) => {
        this.records.set(record.key, record);
      },
      list: () => Array.from(this.records.keys()),
    };
  }

  on(listener: RotationListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(event: RotationEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (err) {
        console.error('SecretRotationService: listener threw', err);
      }
    }
  }

  private async loadRecord(key: string): Promise<SecretRecord | null> {
    const record = await this.backend.read(key);
    if (record) this.records.set(key, record);
    return record;
  }

  private async persist(record: SecretRecord): Promise<void> {
    this.records.set(record.key, record);
    await this.backend.write(record);
  }

  async register(
    key: string,
    kind: SecretKind,
    options: { initialValue?: string; policy?: Partial<RotationPolicy> } = {}
  ): Promise<SecretRecord> {
    const now = this.clock();
    const policy = { ...this.policy, ...(options.policy ?? {}) };
    const existing = await this.loadRecord(key);
    if (existing) {
      this.pruneVersions(existing, now);
      await this.persist(existing);
      return existing;
    }

    const value =
      options.initialValue ?? (await this.generator.generate(kind, key));
    const version: SecretVersion = {
      id: generateId('ver'),
      value,
      createdAt: now,
      expiresAt: now + policy.rotationIntervalMs,
      sequence: 0,
    };
    const record: SecretRecord = {
      key,
      kind,
      status: 'active',
      versions: [version],
      rotationIntervalMs: policy.rotationIntervalMs,
      maxVersions: policy.maxVersions,
      lastRotatedAt: now,
      nextRotationAt: now + policy.rotationIntervalMs,
    };
    await this.persist(record);
    this.recomputeMetrics();
    return record;
  }

  async getSecret(key: string): Promise<string | null> {
    const record = await this.loadRecord(key);
    if (!record) return null;
    const active = this.getActiveVersion(record);
    return active ? active.value : null;
  }

  async isValidSecret(key: string, candidate: string): Promise<boolean> {
    const record = await this.loadRecord(key);
    if (!record || record.status === 'revoked') return false;
    return record.versions.some(
      (v) => v.value === candidate && v.expiresAt > this.clock()
    );
  }

  private getActiveVersion(record: SecretRecord): SecretVersion | null {
    const now = this.clock();
    const valid = record.versions.filter((v) => v.expiresAt > now);
    if (valid.length === 0) return null;
    return valid.reduce((a, b) =>
      b.sequence > a.sequence || (b.sequence === a.sequence && b.createdAt > a.createdAt) ? b : a
    );
  }

  private pruneVersions(record: SecretRecord, now: number): void {
    const overlapMs = this.policy.overlapMs;
    const retained = record.versions
      .filter((v) => v.expiresAt > now - overlapMs)
      .slice(-record.maxVersions);
    record.versions = retained;
  }

  async rotate(key: string, newValue?: string): Promise<SecretRecord> {
    const now = this.clock();
    const start = typeof performance !== 'undefined' ? performance.now() : now;
    const record = await this.loadRecord(key);
    if (!record) {
      throw new Error(`Secret "${key}" is not registered.`);
    }
    this.emit({
      type: 'rotation:started',
      key,
      status: 'rotating',
      timestamp: now,
    });
    try {
      const value = newValue ?? (await this.generator.generate(record.kind, key));
      const nextSeq = record.versions.reduce((m, v) => Math.max(m, v.sequence), -1) + 1;
      const version: SecretVersion = {
        id: generateId('ver'),
        value,
        createdAt: now,
        expiresAt: now + record.rotationIntervalMs,
        sequence: nextSeq,
      };
      record.versions = [...record.versions, version];
      this.pruneVersions(record, now);

      record.status = 'active';
      record.lastRotatedAt = now;
      record.nextRotationAt = now + record.rotationIntervalMs;

      await this.persist(record);
      this.metrics.totalRotations += 1;
      if (typeof performance !== 'undefined') {
        this.metrics.lastRotationLatencyMs = performance.now() - start;
      }
      this.recomputeMetrics();
      this.emit({
        type: 'rotation:completed',
        key,
        status: 'active',
        versionId: version.id,
        timestamp: now,
      });
      return record;
    } catch (err) {
      this.metrics.failedRotations += 1;
      this.recomputeMetrics();
      this.emit({
        type: 'rotation:failed',
        key,
        status: 'active',
        timestamp: now,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  }

  async revoke(key: string): Promise<void> {
    const now = this.clock();
    const record = await this.loadRecord(key);
    if (!record) return;
    record.status = 'revoked';
    record.versions = [];
    record.nextRotationAt = null;
    await this.persist(record);
    this.recomputeMetrics();
    this.emit({
      type: 'secret:revoked',
      key,
      status: 'revoked',
      timestamp: now,
    });
  }

  async evaluateExpiry(): Promise<RotationEvent[]> {
    const now = this.clock();
    const events: RotationEvent[] = [];
    const keys = await this.listKeys();
    for (const key of keys) {
      const record = await this.loadRecord(key);
      if (!record || record.status === 'revoked') continue;

      if (this.getActiveVersion(record) === null) {
        record.status = 'expired';
        await this.persist(record);
        this.metrics.expiredSecrets += 1;
        const ev: RotationEvent = {
          type: 'secret:expired',
          key,
          status: 'expired',
          timestamp: now,
        };
        this.emit(ev);
        events.push(ev);
        continue;
      }

      const active = this.getActiveVersion(record)!;
      const warnWindow = Math.min(this.policy.overlapMs, record.rotationIntervalMs);
      if (record.status !== 'expiring' && active.expiresAt - now <= warnWindow) {
        record.status = 'expiring';
        await this.persist(record);
        const ev: RotationEvent = {
          type: 'secret:expiring',
          key,
          status: 'expiring',
          versionId: active.id,
          timestamp: now,
        };
        this.emit(ev);
        events.push(ev);
      }
    }
    this.recomputeMetrics();
    return events;
  }

  async listKeys(): Promise<string[]> {
    const persisted = await this.backend.list();
    const merged = new Set<string>(persisted);
    for (const key of this.records.keys()) merged.add(key);
    return Array.from(merged);
  }

  getMetrics(): RotationMetrics {
    this.recomputeMetrics();
    return { ...this.metrics };
  }

  private recomputeMetrics(): void {
    let active = 0;
    let expired = 0;
    for (const record of this.records.values()) {
      if (record.status === 'revoked') continue;
      if (!this.getActiveVersion(record)) {
        expired += 1;
      } else {
        active += 1;
      }
    }
    this.metrics.activeSecrets = active;
    this.metrics.expiredSecrets = expired;
  }
}

export type RotationListener = RotationEventListener;
export const SECRET_ROTATION_DEFAULT_POLICY = DEFAULT_POLICY;
