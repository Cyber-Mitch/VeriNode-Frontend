'use client'

import { useCallback } from 'react'

function clamp(value: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, value))
}

/**
 * Dual-handle slider selecting an inclusive [from, to] epoch range. Enforces a
 * minimum span so the histogram never zooms tighter than `minSpan` epochs.
 * Built from two overlaid range inputs; pointer events are routed to the thumbs
 * so both handles stay independently grabbable.
 */
export function EpochRangeSelector({
  min,
  max,
  value,
  minSpan = 8,
  onChange,
}: {
  min: number
  max: number
  value: [number, number]
  minSpan?: number
  onChange: (from: number, to: number) => void
}) {
  const span = Math.max(1, max - min)
  const from = clamp(value[0], min, max)
  const to = clamp(value[1], min, max)
  const disabled = max - min + 1 < minSpan

  const lowPct = ((from - min) / span) * 100
  const highPct = ((to - min) / span) * 100

  const handleFrom = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const next = clamp(Number(event.target.value), min, to - minSpan)
      onChange(next, to)
    },
    [min, to, minSpan, onChange],
  )

  const handleTo = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const next = clamp(Number(event.target.value), from + minSpan, max)
      onChange(from, next)
    },
    [from, max, minSpan, onChange],
  )

  return (
    <div className="space-y-2">
      <style>{`
        .epoch-range input[type="range"] {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 24px;
          margin: 0;
          background: transparent;
          pointer-events: none;
          -webkit-appearance: none;
          appearance: none;
        }
        .epoch-range input[type="range"]:focus { outline: none; }
        .epoch-range input[type="range"]::-webkit-slider-thumb {
          -webkit-appearance: none;
          pointer-events: auto;
          height: 16px; width: 16px;
          border-radius: 9999px;
          background: #38bdf8;
          border: 2px solid #0f172a;
          cursor: pointer;
        }
        .epoch-range input[type="range"]::-moz-range-thumb {
          pointer-events: auto;
          height: 16px; width: 16px;
          border-radius: 9999px;
          background: #38bdf8;
          border: 2px solid #0f172a;
          cursor: pointer;
        }
        .epoch-range input[type="range"]:disabled::-webkit-slider-thumb { background: #475569; cursor: not-allowed; }
        .epoch-range input[type="range"]:disabled::-moz-range-thumb { background: #475569; cursor: not-allowed; }
      `}</style>

      <div className="flex items-center justify-between text-xs text-slate-400">
        <span>
          Epoch <span className="font-semibold text-slate-200">{from}</span> →{' '}
          <span className="font-semibold text-slate-200">{to}</span>
        </span>
        <span>{to - from + 1} epochs</span>
      </div>

      <div className="epoch-range relative h-6">
        <div className="absolute top-1/2 h-1.5 w-full -translate-y-1/2 rounded-full bg-slate-700" />
        <div
          className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-sky-500"
          style={{ left: `${lowPct}%`, right: `${100 - highPct}%` }}
        />
        <input
          type="range"
          min={min}
          max={max}
          step={1}
          value={from}
          onChange={handleFrom}
          disabled={disabled}
          aria-label="From epoch"
        />
        <input
          type="range"
          min={min}
          max={max}
          step={1}
          value={to}
          onChange={handleTo}
          disabled={disabled}
          aria-label="To epoch"
        />
      </div>

      <div className="flex justify-between text-[10px] text-slate-500">
        <span>{min}</span>
        <span>{max}</span>
      </div>
    </div>
  )
}
