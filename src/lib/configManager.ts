export type ConfigValue = string | number | boolean | null | ConfigValue[] | { [key: string]: ConfigValue };
export type ConfigRecord = Record<string, ConfigValue>;

export type SchemaRule<T> = {
  validate: (value: unknown, config: Partial<T>) => value is T[keyof T];
  message: string;
  critical?: boolean;
};

export type ConfigSchema<T extends ConfigRecord> = {
  [K in keyof T]: {
    defaultValue: T[K];
    validate: (value: unknown, config: Partial<T>) => value is T[K];
    message: string;
    critical?: boolean;
  };
};

export type ConfigValidationError<T extends ConfigRecord> = {
  key: keyof T;
  message: string;
  value: unknown;
  critical: boolean;
};

export type ConfigValidationResult<T extends ConfigRecord> =
  | { ok: true; config: T; errors: [] }
  | { ok: false; config: T; errors: ConfigValidationError<T>[] };

export interface ConfigSource<T extends ConfigRecord> {
  load(): Promise<Partial<T>> | Partial<T>;
  revision?(): Promise<string | number> | string | number;
}

export type ConfigChange<T extends ConfigRecord> = {
  previous: T;
  current: T;
  revision: string | number;
  changedKeys: Array<keyof T>;
  loadedAt: number;
};

export type ConfigMetrics = {
  reloadAttempts: number;
  reloadSuccesses: number;
  reloadFailures: number;
  validationFailures: number;
  lastReloadDurationMs: number;
  lastSuccessfulReloadAt: number | null;
  currentRevision: string | number;
};

export type ConfigManagerOptions<T extends ConfigRecord> = {
  schema: ConfigSchema<T>;
  source: ConfigSource<T>;
  pollIntervalMs?: number;
  now?: () => number;
};

const DEFAULT_POLL_INTERVAL_MS = 30_000;

export class ConfigValidationException<T extends ConfigRecord> extends Error {
  constructor(public readonly errors: ConfigValidationError<T>[]) {
    super(errors.map((error) => `${String(error.key)}: ${error.message}`).join('; '));
    this.name = 'ConfigValidationException';
  }
}

export class ConfigManager<T extends ConfigRecord> {
  private current: T;
  private revision: string | number = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private listeners = new Set<(change: ConfigChange<T>) => void>();
  private readonly metrics: ConfigMetrics = {
    reloadAttempts: 0,
    reloadSuccesses: 0,
    reloadFailures: 0,
    validationFailures: 0,
    lastReloadDurationMs: 0,
    lastSuccessfulReloadAt: null,
    currentRevision: 0,
  };

  constructor(private readonly options: ConfigManagerOptions<T>) {
    this.current = defaultsFromSchema(options.schema);
  }

  getConfig(): T {
    return structuredCloneSafe(this.current);
  }

  getMetrics(): ConfigMetrics {
    return { ...this.metrics };
  }

  validate(raw: Partial<T>): ConfigValidationResult<T> {
    const merged = { ...defaultsFromSchema(this.options.schema), ...raw } as T;
    const errors: ConfigValidationError<T>[] = [];

    for (const key of Object.keys(this.options.schema) as Array<keyof T>) {
      const rule = this.options.schema[key];
      if (!rule.validate(merged[key], merged)) {
        errors.push({ key, message: rule.message, value: merged[key], critical: rule.critical ?? true });
        merged[key] = rule.defaultValue;
      }
    }

    return errors.length > 0 ? { ok: false, config: merged, errors } : { ok: true, config: merged, errors: [] };
  }

  async load(): Promise<T> {
    const startedAt = this.now();
    this.metrics.reloadAttempts += 1;
    try {
      const raw = await this.options.source.load();
      const result = this.validate(raw);
      if (!result.ok && result.errors.some((error) => error.critical)) {
        this.metrics.validationFailures += 1;
        throw new ConfigValidationException(result.errors);
      }

      const nextRevision = this.options.source.revision ? await this.options.source.revision() : this.nextNumericRevision();
      this.applyConfig(result.config, nextRevision, startedAt);
      this.metrics.reloadSuccesses += 1;
      this.metrics.lastSuccessfulReloadAt = this.now();
      return this.getConfig();
    } catch (error) {
      this.metrics.reloadFailures += 1;
      throw error;
    } finally {
      this.metrics.lastReloadDurationMs = this.now() - startedAt;
    }
  }

  startHotReload(): () => void {
    if (this.timer) return () => this.stopHotReload();
    this.timer = setInterval(() => {
      void this.load().catch(() => undefined);
    }, this.options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS);
    return () => this.stopHotReload();
  }

  stopHotReload(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  subscribe(listener: (change: ConfigChange<T>) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private applyConfig(next: T, nextRevision: string | number, loadedAt: number): void {
    const previous = this.current;
    const changedKeys = Object.keys(next).filter((key) => previous[key] !== next[key]) as Array<keyof T>;
    this.current = structuredCloneSafe(next);
    this.revision = nextRevision;
    this.metrics.currentRevision = nextRevision;
    if (changedKeys.length === 0) return;
    const change = { previous, current: this.getConfig(), revision: nextRevision, changedKeys, loadedAt };
    this.listeners.forEach((listener) => listener(change));
  }

  private nextNumericRevision(): number {
    return typeof this.revision === 'number' ? this.revision + 1 : 1;
  }

  private now(): number {
    return this.options.now?.() ?? Date.now();
  }
}

export function defaultsFromSchema<T extends ConfigRecord>(schema: ConfigSchema<T>): T {
  return Object.fromEntries(
    Object.entries(schema).map(([key, rule]) => [key, structuredCloneSafe(rule.defaultValue)]),
  ) as T;
}

function structuredCloneSafe<T>(value: T): T {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as T;
}
