'use client';

import { useMemo } from 'react';
import type { HealthScore, LiveOperatorMetrics } from '@/src/types/operator';

/** Gwei (bigint) -> ETH string with fixed precision. */
export function formatGweiAsEth(gwei: bigint, decimals = 4): string {
  const GWEI_PER_ETH = BigInt(1_000_000_000);
  const whole = gwei / GWEI_PER_ETH;
  const frac = gwei % GWEI_PER_ETH;
  const fracStr = frac.toString().padStart(9, '0').slice(0, decimals);
  return `${whole.toString()}.${fracStr}`;
}

function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-xl border bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900">
      <div className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
        {value}
      </div>
      {sub ? <div className="mt-0.5 text-xs text-zinc-400">{sub}</div> : null}
    </div>
  );
}

function gradeColor(grade: HealthScore['grade']): string {
  switch (grade) {
    case 'excellent':
      return 'text-green-600 dark:text-green-400';
    case 'good':
      return 'text-emerald-600 dark:text-emerald-400';
    case 'fair':
      return 'text-amber-600 dark:text-amber-400';
    case 'poor':
      return 'text-red-600 dark:text-red-400';
  }
}

function gaugeStroke(grade: HealthScore['grade']): string {
  switch (grade) {
    case 'excellent':
      return '#16a34a';
    case 'good':
      return '#059669';
    case 'fair':
      return '#d97706';
    case 'poor':
      return '#dc2626';
  }
}

/** Circular health-score gauge (SVG, no external deps). */
function HealthGauge({ health }: { health: HealthScore }) {
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const pct = Math.max(0, Math.min(100, health.score));
  const offset = circumference * (1 - pct / 100);

  return (
    <div
      className="flex flex-col items-center rounded-xl border bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900"
      role="group"
      aria-label={`Node health score ${health.score} out of 100, ${health.grade}`}
    >
      <div className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        Node Health
      </div>
      <div className="relative mt-2 h-32 w-32">
        <svg viewBox="0 0 128 128" className="h-full w-full -rotate-90">
          <circle
            cx="64"
            cy="64"
            r={radius}
            fill="none"
            strokeWidth="10"
            className="stroke-zinc-200 dark:stroke-zinc-700"
          />
          <circle
            cx="64"
            cy="64"
            r={radius}
            fill="none"
            strokeWidth="10"
            strokeLinecap="round"
            stroke={gaugeStroke(health.grade)}
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={{ transition: 'stroke-dashoffset 400ms ease' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-bold tabular-nums text-zinc-900 dark:text-zinc-50">
            {health.score.toFixed(0)}
          </span>
          <span className={`text-xs font-medium capitalize ${gradeColor(health.grade)}`}>
            {health.grade}
          </span>
        </div>
      </div>
      <dl className="mt-3 grid w-full grid-cols-2 gap-x-4 gap-y-1 text-xs">
        <div className="flex justify-between">
          <dt className="text-zinc-500">Attestation</dt>
          <dd className="tabular-nums">{health.components.attestationEffectiveness.toFixed(0)}/40</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-zinc-500">Proposal</dt>
          <dd className="tabular-nums">{health.components.proposalTimeliness.toFixed(0)}/30</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-zinc-500">Uptime</dt>
          <dd className="tabular-nums">{health.components.uptime.toFixed(0)}/20</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-zinc-500">Peers</dt>
          <dd className="tabular-nums">{health.components.peerCount.toFixed(0)}/10</dd>
        </div>
      </dl>
    </div>
  );
}

function EffectivenessBadge({ pct }: { pct: number }) {
  const tone =
    pct >= 95
      ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
      : pct >= 85
        ? 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200'
        : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium tabular-nums ${tone}`}>
      {pct.toFixed(1)}% effective
    </span>
  );
}

export interface OperatorOverviewProps {
  metrics: LiveOperatorMetrics | null;
  health: HealthScore | null;
  isConnected: boolean;
}

/**
 * Top section of the operator dashboard: live balance / epoch / slot /
 * finalized-block cards, the composite health gauge, effectiveness badge, and
 * queue position.
 */
export function OperatorOverview({ metrics, health, isConnected }: OperatorOverviewProps) {
  const balanceEth = useMemo(
    () => (metrics ? formatGweiAsEth(metrics.validatorBalanceGwei) : '—'),
    [metrics],
  );

  if (!metrics) {
    return (
      <div className="rounded-xl border border-dashed p-8 text-center text-sm text-zinc-500 dark:border-zinc-700">
        {isConnected ? 'Waiting for validator metrics…' : 'Connecting to metrics stream…'}
      </div>
    );
  }

  return (
    <section aria-label="Operator overview" className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Overview</h2>
        <div className="flex items-center gap-2">
          <EffectivenessBadge pct={metrics.effectivenessPct} />
          <span className="flex items-center gap-1.5 text-xs text-zinc-500">
            <span
              className={`inline-block h-2 w-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-zinc-400'}`}
              aria-hidden
            />
            {isConnected ? 'Live' : 'Reconnecting'}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Validator Balance" value={`${balanceEth} ETH`} />
        <StatCard label="Current Epoch" value={metrics.currentEpoch.toLocaleString()} />
        <StatCard label="Current Slot" value={metrics.currentSlot.toLocaleString()} />
        <StatCard label="Finalized Block" value={metrics.finalizedBlock.toLocaleString()} />
        <StatCard
          label="Queue Position"
          value={metrics.queuePosition == null ? 'Active' : `#${metrics.queuePosition.toLocaleString()}`}
          sub={metrics.queuePosition == null ? 'Validator is active' : 'In activation queue'}
        />
        <StatCard label="Peers" value={metrics.peerCount.toLocaleString()} />
        <StatCard label="Uptime" value={`${metrics.uptimePct.toFixed(2)}%`} />
      </div>

      {health ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <HealthGauge health={health} />
        </div>
      ) : null}
    </section>
  );
}
