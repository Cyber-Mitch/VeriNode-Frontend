'use client';

import { useEffect, useMemo, useState } from 'react';
import type { BalanceSnapshot, DeltaSummary } from '@/src/types/balance';
import { useHistoricalBalances } from '@/src/hooks/useHistoricalBalances';

const GWEI_PER_ETH = 1_000_000_000;

/** Format a gwei balance as an ETH string with 4 decimals (sign-aware). */
function formatEth(gwei: bigint): string {
  const negative = gwei < BigInt(0);
  const abs = negative ? -gwei : gwei;
  const whole = abs / BigInt(GWEI_PER_ETH);
  const frac = abs % BigInt(GWEI_PER_ETH);
  const fracStr = frac.toString().padStart(9, '0').slice(0, 4);
  return `${negative ? '-' : ''}${whole.toString()}.${fracStr}`;
}

interface ChartGeometry {
  points: string;
  minEth: number;
  maxEth: number;
}

const VIEW_W = 600;
const VIEW_H = 180;

function buildGeometry(series: BalanceSnapshot[]): ChartGeometry | null {
  if (series.length < 2) return null;

  const values = series.map((s) => Number(s.balanceGwei) / GWEI_PER_ETH);
  const minEth = Math.min(...values);
  const maxEth = Math.max(...values);
  const span = maxEth - minEth || 1;
  const epochs = series.map((s) => s.epoch);
  const minEpoch = epochs[0];
  const epochSpan = epochs[epochs.length - 1] - minEpoch || 1;

  const points = series
    .map((s, i) => {
      const x = ((s.epoch - minEpoch) / epochSpan) * VIEW_W;
      const y = VIEW_H - ((values[i] - minEth) / span) * VIEW_H;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');

  return { points, minEth, maxEth };
}

export function BalanceHistoryChart({ validatorIndex }: { validatorIndex: number }) {
  const { series, summary } = useHistoricalBalances();
  const [data, setData] = useState<BalanceSnapshot[]>([]);
  const [delta, setDelta] = useState<DeltaSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const reconstructed = await series(validatorIndex);
        if (cancelled) return;
        setData(reconstructed);

        if (reconstructed.length > 0) {
          const fromEpoch = reconstructed[0].epoch;
          const toEpoch = reconstructed[reconstructed.length - 1].epoch;
          const summed = await summary(validatorIndex, fromEpoch, toEpoch);
          if (!cancelled) setDelta(summed);
        } else {
          setDelta(null);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load balances');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [validatorIndex, series, summary]);

  const geometry = useMemo(() => buildGeometry(data), [data]);

  return (
    <section className="rounded-3xl border border-white/10 bg-slate-900/80 p-6 text-white">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Balance History</h2>
          <p className="text-sm text-slate-400">Validator #{validatorIndex} · per-epoch effective balance</p>
        </div>
        <span className="rounded-full bg-sky-500/10 px-3 py-1 text-xs font-semibold text-sky-300">
          {data.length} epochs
        </span>
      </div>

      {loading ? (
        <p className="py-10 text-center text-sm text-slate-400">Decompressing history…</p>
      ) : error ? (
        <p className="py-10 text-center text-sm text-red-400">{error}</p>
      ) : !geometry ? (
        <p className="py-10 text-center text-sm text-slate-400">No balance history recorded yet.</p>
      ) : (
        <>
          <svg
            viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
            preserveAspectRatio="none"
            className="h-44 w-full rounded-xl bg-slate-950/60"
          >
            <polyline
              points={geometry.points}
              fill="none"
              stroke="#38bdf8"
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
          <div className="mt-2 flex justify-between text-xs text-slate-500">
            <span>{geometry.minEth.toFixed(4)} ETH</span>
            <span>{geometry.maxEth.toFixed(4)} ETH</span>
          </div>
        </>
      )}

      <div className="mt-5 grid grid-cols-3 gap-3 text-sm">
        <Metric label="Rewards" value={delta ? `+${formatEth(delta.rewards)}` : '—'} tone="text-emerald-400" />
        <Metric label="Penalties" value={delta ? `-${formatEth(delta.penalties)}` : '—'} tone="text-red-400" />
        <Metric
          label="Net change"
          value={delta ? `${delta.netChange < BigInt(0) ? '' : '+'}${formatEth(delta.netChange)}` : '—'}
          tone={delta && delta.netChange < BigInt(0) ? 'text-red-400' : 'text-emerald-400'}
        />
      </div>
    </section>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-slate-950/60 p-3">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 font-semibold ${tone}`}>{value} <span className="text-xs text-slate-500">ETH</span></p>
    </div>
  );
}
