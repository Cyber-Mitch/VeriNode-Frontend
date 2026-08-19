'use client';

/**
 * VestingTimeline
 *
 * Horizontal bar visualising a single vesting schedule's elapsed / remaining
 * time, with distinct markers for:
 *   - Cliff end
 *   - Each milestone (for milestone/hybrid schedules)
 *   - Today (progress needle)
 *   - Vesting end
 *
 * The bar is colour-coded:
 *   - Dark grey  → before cliff (locked period)
 *   - Sky blue   → vesting period
 *   - White/5    → future (not yet reached)
 * The "elapsed" fill overlays the above to show how far along we are.
 */

import { useMemo } from 'react';
import { parseISO, addDays, differenceInDays, format } from 'date-fns';
import type { VestingSchedule, VestingMilestone } from '@/src/types/vesting';

interface VestingTimelineProps {
  schedule: VestingSchedule;
}

interface MarkerProps {
  /** Position as 0–100% along the bar. */
  pct: number;
  label: string;
  /** Hex / tailwind color class applied to the marker pip. */
  color?: string;
  /** Pip rendered above (true) or below (false/default) the bar. */
  above?: boolean;
}

function Marker({ pct, label, color = 'bg-white/60', above = false }: MarkerProps) {
  return (
    <div
      className="absolute flex flex-col items-center"
      style={{ left: `${pct}%`, transform: 'translateX(-50%)' }}
    >
      {above ? (
        <>
          <span className="mb-1 whitespace-nowrap text-[9px] text-slate-400">{label}</span>
          <div className={`h-3 w-0.5 ${color}`} />
        </>
      ) : (
        <>
          <div className={`h-3 w-0.5 ${color}`} />
          <span className="mt-1 whitespace-nowrap text-[9px] text-slate-400">{label}</span>
        </>
      )}
    </div>
  );
}

export function VestingTimeline({ schedule: s }: VestingTimelineProps) {
  const { markers, elapsedPct, cliffPct } = useMemo(() => {
    const now = new Date();
    const start = parseISO(s.startDate);
    const cliffEnd = addDays(start, s.cliffDays);

    const total = s.totalDays;
    const cliffPct = total > 0 ? (s.cliffDays / total) * 100 : 0;

    const elapsedDays = Math.max(0, Math.min(total, differenceInDays(now, start)));
    const elapsedPct = total > 0 ? (elapsedDays / total) * 100 : 0;

    // Build milestone markers (only for milestone/hybrid)
    const milestoneMarkers: MarkerProps[] = (s.milestones ?? []).map((m: VestingMilestone) => {
      const mDate = parseISO(m.date);
      const mDays = Math.max(0, Math.min(total, differenceInDays(mDate, start)));
      const mPct = total > 0 ? (mDays / total) * 100 : 0;
      return {
        pct: mPct,
        label: m.label ?? format(mDate, 'MMM d'),
        color: 'bg-amber-400',
        above: true,
      };
    });

    // Today marker
    const todayMarker: MarkerProps = {
      pct: elapsedPct,
      label: 'Today',
      color: 'bg-sky-400',
    };

    // Cliff marker (only if cliff > 0)
    const cliffMarker: MarkerProps | null =
      s.cliffDays > 0
        ? {
            pct: cliffPct,
            label: format(cliffEnd, 'MMM d'),
            color: 'bg-amber-500',
            above: true,
          }
        : null;

    const markers: MarkerProps[] = [
      ...(cliffMarker ? [cliffMarker] : []),
      ...milestoneMarkers,
      todayMarker,
    ];

    return { elapsedPct, cliffPct, markers };
  }, [s]);

  return (
    <div className="space-y-5 rounded-xl border border-white/10 bg-slate-900/70 p-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">{s.label}</h3>
        <span className="text-xs text-slate-400">
          {s.startDate} → {format(addDays(parseISO(s.startDate), s.totalDays), 'yyyy-MM-dd')}
        </span>
      </div>

      {/* Timeline bar */}
      <div className="relative mt-6">
        {/* Top markers (cliff, milestones) */}
        <div className="relative h-6">
          {markers
            .filter((m) => m.above)
            .map((m) => (
              <Marker key={`top-${m.pct}-${m.label}`} {...m} above />
            ))}
        </div>

        {/* Track */}
        <div className="relative h-4 w-full overflow-visible rounded-full bg-white/5">
          {/* Cliff region (darker) */}
          {cliffPct > 0 && (
            <div
              className="absolute inset-y-0 left-0 rounded-l-full bg-slate-700/80"
              style={{ width: `${cliffPct}%` }}
              title="Cliff period"
            />
          )}

          {/* Vesting region */}
          <div
            className="absolute inset-y-0 rounded-r-full bg-sky-900/40"
            style={{ left: `${cliffPct}%`, right: 0 }}
            title="Vesting period"
          />

          {/* Elapsed fill */}
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-sky-500/60 transition-all duration-700"
            style={{ width: `${elapsedPct}%` }}
            title={`${elapsedPct.toFixed(1)}% elapsed`}
            role="progressbar"
            aria-valuenow={elapsedPct}
            aria-valuemin={0}
            aria-valuemax={100}
          />
        </div>

        {/* Bottom markers (today) */}
        <div className="relative h-6 mt-0.5">
          {markers
            .filter((m) => !m.above)
            .map((m) => (
              <Marker key={`bot-${m.pct}-${m.label}`} {...m} above={false} />
            ))}
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 text-xs text-slate-400">
        {s.cliffDays > 0 && (
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-slate-700/80" />
            Cliff ({s.cliffDays}d)
          </span>
        )}
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-sky-900/40" />
          Vesting
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-sky-500/60" />
          Elapsed
        </span>
        {(s.vestingType === 'milestone' || s.vestingType === 'hybrid') && (
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-2.5 bg-amber-400" />
            Milestone
          </span>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// VestingTimelineList — renders one timeline per schedule
// ---------------------------------------------------------------------------

interface VestingTimelineListProps {
  schedules: VestingSchedule[];
}

export function VestingTimelineList({ schedules }: VestingTimelineListProps) {
  if (schedules.length === 0) return null;

  return (
    <div className="space-y-4">
      {schedules.map((s) => (
        <VestingTimeline key={s.id} schedule={s} />
      ))}
    </div>
  );
}
