'use client';

import { useCallback, useEffect, useState } from 'react';

export interface AlertConfig {
  /** Alert when missed attestations in the recent window exceed this count. */
  missedAttestationsThreshold: number;
  /** Alert when validator balance drops by more than this percent. */
  balanceDropPct: number;
  /** Alert when attestation effectiveness falls below this percent. */
  effectivenessFloorPct: number;
  channels: { push: boolean; email: boolean };
}

export const DEFAULT_ALERT_CONFIG: AlertConfig = {
  missedAttestationsThreshold: 3,
  balanceDropPct: 5,
  effectivenessFloorPct: 90,
  channels: { push: true, email: false },
};

const STORAGE_KEY = 'operator-alert-config';

function loadConfig(): AlertConfig {
  if (typeof window === 'undefined') return DEFAULT_ALERT_CONFIG;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_ALERT_CONFIG;
    const parsed = JSON.parse(raw) as Partial<AlertConfig>;
    return {
      ...DEFAULT_ALERT_CONFIG,
      ...parsed,
      channels: { ...DEFAULT_ALERT_CONFIG.channels, ...parsed.channels },
    };
  } catch {
    return DEFAULT_ALERT_CONFIG;
  }
}

function Slider({
  id,
  label,
  min,
  max,
  step,
  value,
  suffix,
  onChange,
}: {
  id: string;
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  suffix: string;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <label htmlFor={id} className="text-sm text-zinc-600 dark:text-zinc-300">
          {label}
        </label>
        <span className="text-sm font-medium tabular-nums text-zinc-900 dark:text-zinc-50">
          {value}
          {suffix}
        </span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 w-full accent-blue-600"
      />
    </div>
  );
}

export interface AlertConfigPanelProps {
  initialConfig?: AlertConfig;
  onChange?: (config: AlertConfig) => void;
}

/** User-configurable alert thresholds + notification channels (persisted). */
export function AlertConfigPanel({ initialConfig, onChange }: AlertConfigPanelProps) {
  const [config, setConfig] = useState<AlertConfig>(initialConfig ?? DEFAULT_ALERT_CONFIG);

  // Hydrate from storage on mount. Reading localStorage during render would
  // cause an SSR/client hydration mismatch, so it is deferred to an effect.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing from an external source (localStorage), not deriving from props/state
    if (!initialConfig) setConfig(loadConfig());
  }, [initialConfig]);

  const update = useCallback(
    (patch: Partial<AlertConfig>) => {
      setConfig((prev) => {
        const next: AlertConfig = {
          ...prev,
          ...patch,
          channels: { ...prev.channels, ...patch.channels },
        };
        if (typeof window !== 'undefined') {
          window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        }
        onChange?.(next);
        return next;
      });
    },
    [onChange],
  );

  return (
    <section
      aria-label="Alert configuration"
      className="rounded-xl border bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900"
    >
      <h3 className="mb-3 text-sm font-medium text-zinc-700 dark:text-zinc-200">Alert Thresholds</h3>
      <div className="space-y-4">
        <Slider
          id="alert-missed-attestations"
          label="Missed attestations"
          min={1}
          max={20}
          step={1}
          value={config.missedAttestationsThreshold}
          suffix=""
          onChange={(v) => update({ missedAttestationsThreshold: v })}
        />
        <Slider
          id="alert-balance-drop"
          label="Balance drop"
          min={1}
          max={50}
          step={1}
          value={config.balanceDropPct}
          suffix="%"
          onChange={(v) => update({ balanceDropPct: v })}
        />
        <Slider
          id="alert-effectiveness-floor"
          label="Effectiveness floor"
          min={50}
          max={100}
          step={1}
          value={config.effectivenessFloorPct}
          suffix="%"
          onChange={(v) => update({ effectivenessFloorPct: v })}
        />
      </div>

      <fieldset className="mt-4">
        <legend className="text-sm text-zinc-600 dark:text-zinc-300">Notification channels</legend>
        <div className="mt-2 flex gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={config.channels.push}
              onChange={(e) => update({ channels: { ...config.channels, push: e.target.checked } })}
              className="accent-blue-600"
            />
            Push
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={config.channels.email}
              onChange={(e) => update({ channels: { ...config.channels, email: e.target.checked } })}
              className="accent-blue-600"
            />
            Email
          </label>
        </div>
      </fieldset>
    </section>
  );
}
