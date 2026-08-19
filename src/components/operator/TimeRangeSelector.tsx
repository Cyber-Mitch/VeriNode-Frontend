'use client';

import { useState } from 'react';
import type { TimeRange, TimeRangePreset } from '@/src/types/operator';

const PRESETS: { key: TimeRangePreset; label: string }[] = [
  { key: '24h', label: '24h' },
  { key: '7d', label: '7d' },
  { key: '30d', label: '30d' },
];

function toDateInput(ms: number): string {
  // yyyy-mm-dd for <input type="date">
  return new Date(ms).toISOString().slice(0, 10);
}

export interface TimeRangeSelectorProps {
  value: TimeRange;
  onChange: (range: TimeRange) => void;
}

/** Shared 24h / 7d / 30d / custom range control driving charts and export. */
export function TimeRangeSelector({ value, onChange }: TimeRangeSelectorProps) {
  const isPreset = value.kind === 'preset';
  // Captured once on mount (lazy initializer) so render stays pure.
  const [now] = useState(() => Date.now());
  const customFrom = value.kind === 'custom' ? value.fromMs : now - 7 * 24 * 60 * 60 * 1000;
  const customTo = value.kind === 'custom' ? value.toMs : now;

  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Time range">
      <div className="inline-flex overflow-hidden rounded-lg border dark:border-zinc-700">
        {PRESETS.map((p) => {
          const active = isPreset && value.preset === p.key;
          return (
            <button
              key={p.key}
              type="button"
              aria-pressed={active}
              onClick={() => onChange({ kind: 'preset', preset: p.key })}
              className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                active
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-zinc-600 hover:bg-zinc-50 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800'
              }`}
            >
              {p.label}
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-1.5">
        <label className="text-xs text-zinc-500" htmlFor="range-from">
          From
        </label>
        <input
          id="range-from"
          type="date"
          value={toDateInput(customFrom)}
          max={toDateInput(customTo)}
          onChange={(e) =>
            onChange({ kind: 'custom', fromMs: new Date(e.target.value).getTime(), toMs: customTo })
          }
          className="rounded-md border px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
        <label className="text-xs text-zinc-500" htmlFor="range-to">
          To
        </label>
        <input
          id="range-to"
          type="date"
          value={toDateInput(customTo)}
          min={toDateInput(customFrom)}
          onChange={(e) =>
            onChange({ kind: 'custom', fromMs: customFrom, toMs: new Date(e.target.value).getTime() })
          }
          className="rounded-md border px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
      </div>
    </div>
  );
}
