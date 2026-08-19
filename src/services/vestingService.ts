/**
 * Vesting API service.
 *
 * Fetches vesting schedules from /api/v1/vesting/{address} and the
 * current token price from CoinGecko, then computes estimated USD values.
 */

import type { VestingData, VestingSchedule, UpcomingUnlock, ClaimRecord } from '@/src/types/vesting';
import { addDays, format, isAfter, isBefore, parseISO } from 'date-fns';

/** Number of upcoming unlock events to surface. */
const UPCOMING_LIMIT = 5;

/**
 * Build the next N unlock events from the given schedules relative to `now`.
 * For linear schedules we emit one "next linear release" date.
 * For milestone schedules we emit each future milestone.
 */
function buildUpcomingUnlocks(
  schedules: VestingSchedule[],
  now: Date,
  tokenPriceUsd: number | null,
): UpcomingUnlock[] {
  const events: UpcomingUnlock[] = [];

  for (const s of schedules) {
    const start = parseISO(s.startDate);
    const cliffEnd = addDays(start, s.cliffDays);
    const vestingEnd = addDays(start, s.totalDays);

    if (isAfter(now, vestingEnd)) continue; // fully vested, nothing upcoming

    if (s.vestingType === 'milestone' || s.vestingType === 'hybrid') {
      for (const m of s.milestones ?? []) {
        const mDate = parseISO(m.date);
        if (isAfter(mDate, now)) {
          events.push({
            scheduleId: s.id,
            scheduleLabel: s.label,
            date: m.date,
            amount: m.amount,
            tokenSymbol: s.tokenSymbol,
            estimatedUsd: tokenPriceUsd != null ? m.amount * tokenPriceUsd : null,
          });
        }
      }
    }

    // For linear (and the linear part of hybrid), emit one upcoming event:
    // either the cliff end (if still pending) or the final vesting end.
    if (s.vestingType === 'linear' || s.vestingType === 'hybrid') {
      const nextLinear = isBefore(now, cliffEnd) ? cliffEnd : vestingEnd;
      if (isAfter(nextLinear, now)) {
        // Approximate the remaining linear release
        const remaining = s.totalAmount - s.releasedAmount;
        events.push({
          scheduleId: s.id,
          scheduleLabel: s.label,
          date: format(nextLinear, "yyyy-MM-dd'T'HH:mm:ss"),
          amount: remaining,
          tokenSymbol: s.tokenSymbol,
          estimatedUsd: tokenPriceUsd != null ? remaining * tokenPriceUsd : null,
        });
      }
    }
  }

  // Sort ascending by date and take top N
  return events
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, UPCOMING_LIMIT);
}

export interface FetchVestingOptions {
  /** Connected wallet address. */
  address: string;
  /** If provided, overrides the live price for estimated USD values. */
  tokenPriceUsd?: number | null;
}

/**
 * Fetch vesting data for `address` and merge with current token price.
 * Falls back to demo data if the API is unavailable (dev / no backend).
 */
export async function fetchVestingData(options: FetchVestingOptions): Promise<VestingData> {
  const { address, tokenPriceUsd = null } = options;

  let raw: { schedules: VestingSchedule[]; claimHistory: ClaimRecord[] };

  try {
    const res = await fetch(`/api/v1/vesting/${encodeURIComponent(address)}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    raw = await res.json();
  } catch {
    // API not available – use demo data so the UI is always exercisable.
    raw = buildDemoData(address);
  }

  const now = new Date();
  const upcomingUnlocks = buildUpcomingUnlocks(raw.schedules, now, tokenPriceUsd);

  // Attach estimated USD to claim history if we have a current price
  const claimHistory: ClaimRecord[] = raw.claimHistory.map((c) => ({
    ...c,
    // Preserve server-side usdValueAtClaim; only back-fill if null
    usdValueAtClaim: c.usdValueAtClaim ?? (tokenPriceUsd != null ? c.amount * tokenPriceUsd : null),
  }));

  return { schedules: raw.schedules, upcomingUnlocks, claimHistory };
}

// ---------------------------------------------------------------------------
// Demo / fallback data
// ---------------------------------------------------------------------------

function buildDemoData(address: string): {
  schedules: VestingSchedule[];
  claimHistory: ClaimRecord[];
} {
  const today = new Date();

  const schedules: VestingSchedule[] = [
    {
      id: 'team-alloc',
      label: 'Team Allocation',
      startDate: format(addDays(today, -365), 'yyyy-MM-dd'),
      cliffDays: 180,
      totalDays: 730,
      totalAmount: 500_000,
      releasedAmount: 171_233,
      claimableAmount: 15_400,
      vestingType: 'linear',
      tokenSymbol: 'VNT',
    },
    {
      id: 'investor-a',
      label: 'Investor Round A',
      startDate: format(addDays(today, -200), 'yyyy-MM-dd'),
      cliffDays: 90,
      totalDays: 365,
      totalAmount: 250_000,
      releasedAmount: 98_630,
      claimableAmount: 5_200,
      vestingType: 'linear',
      tokenSymbol: 'VNT',
    },
    {
      id: 'ecosystem-grant',
      label: 'Ecosystem Grant',
      startDate: format(addDays(today, -60), 'yyyy-MM-dd'),
      cliffDays: 0,
      totalDays: 365,
      totalAmount: 100_000,
      releasedAmount: 16_438,
      claimableAmount: 2_300,
      vestingType: 'milestone',
      tokenSymbol: 'VNT',
      milestones: [
        {
          date: format(addDays(today, 30), "yyyy-MM-dd'T'00:00:00"),
          amount: 25_000,
          label: 'Milestone 1 – Mainnet launch',
        },
        {
          date: format(addDays(today, 90), "yyyy-MM-dd'T'00:00:00"),
          amount: 25_000,
          label: 'Milestone 2 – 10k users',
        },
        {
          date: format(addDays(today, 180), "yyyy-MM-dd'T'00:00:00"),
          amount: 50_000,
          label: 'Milestone 3 – Full governance',
        },
      ],
    },
  ];

  const claimHistory: ClaimRecord[] = [
    {
      id: 'claim-1',
      scheduleId: 'team-alloc',
      scheduleLabel: 'Team Allocation',
      date: format(addDays(today, -30), "yyyy-MM-dd'T'14:22:10"),
      amount: 12_000,
      tokenSymbol: 'VNT',
      usdValueAtClaim: 6_240,
      txHash: `0x${address.slice(2, 10)}a1b2c3d4e5f60001`,
    },
    {
      id: 'claim-2',
      scheduleId: 'investor-a',
      scheduleLabel: 'Investor Round A',
      date: format(addDays(today, -15), "yyyy-MM-dd'T'09:05:33"),
      amount: 8_500,
      tokenSymbol: 'VNT',
      usdValueAtClaim: 4_675,
      txHash: `0x${address.slice(2, 10)}b2c3d4e5f6a70002`,
    },
    {
      id: 'claim-3',
      scheduleId: 'team-alloc',
      scheduleLabel: 'Team Allocation',
      date: format(addDays(today, -5), "yyyy-MM-dd'T'16:44:07"),
      amount: 9_200,
      tokenSymbol: 'VNT',
      usdValueAtClaim: 4_968,
      txHash: `0x${address.slice(2, 10)}c3d4e5f6a7b80003`,
    },
  ];

  return { schedules, claimHistory };
}
