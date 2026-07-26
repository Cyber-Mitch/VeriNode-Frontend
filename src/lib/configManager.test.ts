import { describe, expect, it, vi } from 'vitest';
import { ConfigManager, ConfigValidationException, type ConfigSchema } from './configManager';

type AppConfig = {
  maxRequests: number;
  maintenanceMode: boolean;
  apiBaseUrl: string;
};

const schema: ConfigSchema<AppConfig> = {
  maxRequests: {
    defaultValue: 100,
    validate: (value): value is number => typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= 10_000,
    message: 'must be an integer between 1 and 10000',
    critical: true,
  },
  maintenanceMode: {
    defaultValue: false,
    validate: (value): value is boolean => typeof value === 'boolean',
    message: 'must be a boolean',
    critical: false,
  },
  apiBaseUrl: {
    defaultValue: 'https://api.verinode.example',
    validate: (value): value is string => typeof value === 'string' && value.startsWith('https://'),
    message: 'must be an HTTPS URL',
    critical: true,
  },
};

describe('ConfigManager', () => {
  it('merges defaults with source configuration and exposes immutable snapshots', async () => {
    const manager = new ConfigManager({
      schema,
      source: { load: () => ({ maxRequests: 250 }), revision: () => 'rev-1' },
    });

    const loaded = await manager.load();
    loaded.maxRequests = 1;

    expect(manager.getConfig()).toEqual({
      maxRequests: 250,
      maintenanceMode: false,
      apiBaseUrl: 'https://api.verinode.example',
    });
    expect(manager.getMetrics()).toMatchObject({ reloadAttempts: 1, reloadSuccesses: 1, currentRevision: 'rev-1' });
  });

  it('rejects critical validation failures and keeps the previous known-good config', async () => {
    let raw: Partial<AppConfig> = { maxRequests: 500 };
    const manager = new ConfigManager({ schema, source: { load: () => raw } });
    await manager.load();

    raw = { maxRequests: -1, apiBaseUrl: 'http://insecure.example' };

    await expect(manager.load()).rejects.toBeInstanceOf(ConfigValidationException);
    expect(manager.getConfig().maxRequests).toBe(500);
    expect(manager.getMetrics()).toMatchObject({ reloadAttempts: 2, reloadSuccesses: 1, reloadFailures: 1, validationFailures: 1 });
  });

  it('falls back to defaults for non-critical invalid fields and notifies subscribers of changed keys', async () => {
    const listener = vi.fn();
    const manager = new ConfigManager({
      schema,
      source: { load: () => ({ maxRequests: 300, maintenanceMode: 'yes' } as unknown as Partial<AppConfig>), revision: () => 7 },
    });
    manager.subscribe(listener);

    await manager.load();

    expect(manager.getConfig().maintenanceMode).toBe(false);
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ revision: 7, changedKeys: ['maxRequests'] }));
  });

  it('polls the source for hot-reload until stopped', async () => {
    vi.useFakeTimers();
    const source = { load: vi.fn(() => ({ maxRequests: 100 })), revision: vi.fn(() => source.load.mock.calls.length) };
    const manager = new ConfigManager({ schema, source, pollIntervalMs: 50 });

    const stop = manager.startHotReload();
    await vi.advanceTimersByTimeAsync(125);
    stop();
    await vi.advanceTimersByTimeAsync(100);

    expect(source.load).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
});
