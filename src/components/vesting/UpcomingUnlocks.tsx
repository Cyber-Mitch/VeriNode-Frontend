'use client';

/**
 * UpcomingUnlocks
 *
 * Table of the next 5 upcoming unlock events showing:
 *  - Schedule name
 *  - Unlock date
 *  - Countdown timer (live, updates every second)
 *  - Token amount
 *  - Estimated USD value
 *  - "Claim Available" button (only when the unlock date has passed and
 *    there are claimable tokens on the corresponding schedule)
 */

import { useEffect, useState } from 'react';
import { parseISO, isAfter } from 'date-fns';
import type { UpcomingUnlock, VestingSchedule } from '@/src/types/vesting';

interface UpcomingUnlocksProps {
  unlocks: UpcomingUnlock[];
  schedules: VestingSchedule[];
  onClaim?: (scheduleId: string) => void;
}

// ── countdown helpers ─────────────────────────────────────────────────────────

function formatCountdown(targetDate: Date, now: Date): string {
  const diffMs = targetDate.getTime() - now.getTime();
  if (diffMs <= 0) return 'Now';

  const totalSeconds = Math.floor(diffMs / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  return `${minutes}m ${seconds}s`;
}

function useNow(intervalMs = 1000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

// ── formatting helpers ────────────────────────────────────────────────────────

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

// ── row component (live countdown) ───────────────────────────────────────────

interface UnlockRowProps {
  unlock: UpcomingUnlock;
  schedule: VestingSchedule | undefined;
  now: Date;
  onClaim?: (scheduleId: string) => void;
}

function UnlockRow({ unlock, schedule, now, onClaim }: UnlockRowProps) {
  const target = parseISO(unlock.date);
  const isPast = !isAfter(target, now);
  const canClaim = isPast && schedule != null && schedule.claimableAmount > 0;

  return (
    <tr className="border-b border-white/5 text-sm text-slate-200">
      {/* Schedule */}
      <td className="px-4 py-3 text-slate-300">{unlock.scheduleLabel}</td>

      {/* Date */}
      <td className="px-4 py-3 tabular-nums text-slate-400">
        {target.toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
        })}
      </td>

      {/* Countdown */}
      <td className="px-4 py-3 tabular-nums">
        {isPast ? (
          <span className="text-emerald-400 font-medium">Unlocked</span>
        ) : (
          <span className="text-sky-300 font-mono text-xs">{formatCountdown(target, now)}</span>
        )}
      </td>

      {/* Amount */}
      <td className="px-4 py-3 tabular-nums text-white">
        {formatAmount(unlock.amount, unlock.tokenSymbol)}
      </td>

      {/* Estimated USD */}
      <td className="px-4 py-3 tabular-nums text-slate-400">
        {formatUsd(unlock.estimatedUsd)}
      </td>

      {/* Claim */}
      <td className="px-4 py-3">
        {canClaim && onClaim ? (
          <button
            type="button"
            onClick={() => onClaim(unlock.scheduleId)}
            className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-400 transition-colors hover:bg-emerald-500/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400"
            aria-label={`Claim available tokens from ${unlock.scheduleLabel}`}
          >
            Claim Available
          </button>
        ) : (
          <span className="text-slate-600 text-xs">—</span>
        )}
      </td>
    </tr>
  );
}

// ── main export ───────────────────────────────────────────────────────────────

export function UpcomingUnlocks({ unlocks, schedules, onClaim }: UpcomingUnlocksProps) {
  const now = useNow();

  // Build a lookup map for schedules
  const scheduleMap = new Map<string, VestingSchedule>(schedules.map((s) => [s.id, s]));

  if (unlocks.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-slate-400">
        No upcoming unlock events found.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-white/10">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="text-xs uppercase tracking-wide text-slate-500 border-b border-white/10">
          <tr>
            <th className="px-4 py-3 font-medium">Schedule</th>
            <th className="px-4 py-3 font-medium">Date</th>
            <th className="px-4 py-3 font-medium">Countdown</th>
            <th className="px-4 py-3 font-medium">Amount</th>
            <th className="px-4 py-3 font-medium">Est. USD</th>
            <th className="px-4 py-3 font-medium">Action</th>
          </tr>
        </thead>
        <tbody>
          {unlocks.map((u) => (
            <UnlockRow
              key={`${u.scheduleId}-${u.date}`}
              unlock={u}
              schedule={scheduleMap.get(u.scheduleId)}
              now={now}
              onClaim={onClaim}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
