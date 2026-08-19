'use client';

/**
 * VestingOverview
 *
 * Renders a list of vesting schedules, each showing:
 *  - Schedule label and vesting type badge
 *  - Status badge (pending / cliff / vesting / completed)
 *  - Progress bar (released / total)
 *  - Key figures: total, released, claimable, estimated USD
 */

import { useMemo } from 'react';
import { parseISO, addDays, isAfter, isBefore } from 'date-fns';
import type { VestingSchedule } from '@/src/types/vesting';
import type { VestingStatus } from '@/src/types/vesting';

interface VestingOverviewProps {
  schedules: VestingSchedule[];
  tokenPriceUsd: number | null;
  /** Called when the user clicks "Claim" on a schedule. */
  onClaim?: (scheduleId: string) => void;
}

// ── helpers ──────────────────────────────────────────────────────────────────

function resolveStatus(s: VestingSchedule, now: Date): VestingStatus {
  const start = parseISO(s.startDate);
  const cliffEnd = addDays(start, s.cliffDays);
  const vestingEnd = addDays(start, s.totalDays);

  if (isBefore(now, start)) return 'pending';
  if (s.cliffDays > 0 && isBefore(now, cliffEnd)) return 'cliff';
  if (isAfter(now, vestingEnd)) return 'completed';
  return 'vesting';
}

const STATUS_STYLES: Record<VestingStatus, string> = {
  pending: 'bg-slate-700/60 text-slate-400',
  cliff: 'bg-amber-500/15 text-amber-400',
  vesting: 'bg-sky-500/15 text-sky-300',
  completed: 'bg-emerald-500/15 text-emerald-400',
};

const STATUS_LABELS: Record<VestingStatus, string> = {
  pending: 'Pending',
  cliff: 'Cliff',
  vesting: 'Vesting',
  completed: 'Completed',
};

const TYPE_STYLES: Record<string, string> = {
  linear: 'bg-violet-500/15 text-violet-400',
  milestone: 'bg-amber-500/15 text-amber-400',
  hybrid: 'bg-teal-500/15 text-teal-400',
};

function formatAmount(n: number, symbol: string): string {
  return `${n.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${symbol}`;
}

function formatUsd(n: number | null): string {
  if (n == null) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(n);
}

// ── sub-components ────────────────────────────────────────────────────────────

interface ScheduleCardProps {
  schedule: VestingSchedule;
  tokenPriceUsd: number | null;
  onClaim?: (id: string) => void;
}

function ScheduleCard({ schedule: s, tokenPriceUsd, onClaim }: ScheduleCardProps) {
  const now = useMemo(() => new Date(), []);
  const status = useMemo(() => resolveStatus(s, now), [s, now]);

  const progressPct = s.totalAmount > 0
    ? Math.min(100, (s.releasedAmount / s.totalAmount) * 100)
    : 0;

  const estimatedTotalUsd = tokenPriceUsd != null ? s.totalAmount * tokenPriceUsd : null;
  const estimatedClaimableUsd = tokenPriceUsd != null ? s.claimableAmount * tokenPriceUsd : null;

  const canClaim = status === 'vesting' || status === 'completed';

  return (
    <div className="rounded-xl border border-white/10 bg-slate-900/70 p-5 space-y-4">
      {/* Header row */}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="space-y-1">
          <h3 className="text-base font-semibold text-white">{s.label}</h3>
          <p className="text-xs text-slate-400">
            Started {s.startDate}
            {s.cliffDays > 0 && ` · ${s.cliffDays}d cliff`}
            {' · '}{s.totalDays}d total
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {/* Vesting type badge */}
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${TYPE_STYLES[s.vestingType] ?? 'bg-slate-700 text-slate-400'}`}
          >
            {s.vestingType}
          </span>

          {/* Status badge */}
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLES[status]}`}
          >
            {STATUS_LABELS[status]}
          </span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="space-y-1.5">
        <div className="flex justify-between text-xs text-slate-400">
          <span>Released</span>
          <span>
            {progressPct.toFixed(1)}% · {formatAmount(s.releasedAmount, s.tokenSymbol)}
          </span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-white/5">
          <div
            className="h-full rounded-full bg-emerald-400 transition-all duration-500"
            style={{ width: `${progressPct}%` }}
            role="progressbar"
            aria-valuenow={progressPct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`${progressPct.toFixed(1)}% vested`}
          />
        </div>
        <div className="flex justify-between text-xs text-slate-500">
          <span>0</span>
          <span>{formatAmount(s.totalAmount, s.tokenSymbol)}</span>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatPill
          label="Total"
          value={formatAmount(s.totalAmount, s.tokenSymbol)}
          sub={formatUsd(estimatedTotalUsd)}
        />
        <StatPill
          label="Released"
          value={formatAmount(s.releasedAmount, s.tokenSymbol)}
          tone="text-emerald-400"
        />
        <StatPill
          label="Remaining"
          value={formatAmount(s.totalAmount - s.releasedAmount, s.tokenSymbol)}
          tone="text-slate-300"
        />
        <StatPill
          label="Claimable"
          value={formatAmount(s.claimableAmount, s.tokenSymbol)}
          sub={formatUsd(estimatedClaimableUsd)}
          tone="text-amber-400"
        />
      </div>

      {/* Claim button */}
      {onClaim && canClaim && s.claimableAmount > 0 && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => onClaim(s.id)}
            className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-1.5 text-sm font-medium text-emerald-400 transition-colors hover:bg-emerald-500/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400"
            aria-label={`Claim ${formatAmount(s.claimableAmount, s.tokenSymbol)} from ${s.label}`}
          >
            Claim {formatAmount(s.claimableAmount, s.tokenSymbol)}
          </button>
        </div>
      )}
    </div>
  );
}

interface StatPillProps {
  label: string;
  value: string;
  sub?: string;
  tone?: string;
}

function StatPill({ label, value, sub, tone = 'text-white' }: StatPillProps) {
  return (
    <div className="rounded-lg bg-slate-800/50 px-3 py-2">
      <p className="text-[10px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-0.5 text-sm font-semibold tabular-nums ${tone}`}>{value}</p>
      {sub != null && <p className="text-[10px] text-slate-500">{sub}</p>}
    </div>
  );
}

// ── main export ───────────────────────────────────────────────────────────────

export function VestingOverview({ schedules, tokenPriceUsd, onClaim }: VestingOverviewProps) {
  if (schedules.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-slate-400">
        No vesting schedules found for this wallet.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {schedules.map((s) => (
        <ScheduleCard
          key={s.id}
          schedule={s}
          tokenPriceUsd={tokenPriceUsd}
          onClaim={onClaim}
        />
      ))}
    </div>
  );
}
