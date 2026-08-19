/**
 * Types for the Token Vesting and Lockup Schedule Viewer (Issue #172).
 */

/** How tokens are released over time. */
export type VestingType = 'linear' | 'milestone' | 'hybrid';

/** Status of a vesting schedule. */
export type VestingStatus = 'pending' | 'cliff' | 'vesting' | 'completed';

/** A discrete milestone event within a hybrid/milestone schedule. */
export interface VestingMilestone {
  /** ISO 8601 date string when this milestone unlocks. */
  date: string;
  /** Token amount released at this milestone. */
  amount: number;
  /** Optional human-readable label. */
  label?: string;
}

/** A single vesting schedule entry returned by /api/v1/vesting/{address}. */
export interface VestingSchedule {
  id: string;
  /** Allocation label, e.g. "Team Allocation", "Investor Round A". */
  label: string;
  /** ISO 8601 start date. */
  startDate: string;
  /** Cliff duration in days (0 = no cliff). */
  cliffDays: number;
  /** Total vesting duration in days from startDate. */
  totalDays: number;
  /** Total tokens allocated. */
  totalAmount: number;
  /** Tokens already released / claimed. */
  releasedAmount: number;
  /** Tokens currently claimable (vested but not yet claimed). */
  claimableAmount: number;
  vestingType: VestingType;
  /** Token symbol, e.g. "VNT". */
  tokenSymbol: string;
  milestones?: VestingMilestone[];
}

/** An upcoming unlock event (next N unlocks). */
export interface UpcomingUnlock {
  scheduleId: string;
  scheduleLabel: string;
  /** ISO 8601 date/time of the unlock. */
  date: string;
  amount: number;
  tokenSymbol: string;
  /** Estimated USD value at current price. */
  estimatedUsd: number | null;
}

/** A historical claim record. */
export interface ClaimRecord {
  id: string;
  scheduleId: string;
  scheduleLabel: string;
  /** ISO 8601 date/time of the claim transaction. */
  date: string;
  amount: number;
  tokenSymbol: string;
  /** USD value at the time of claim. */
  usdValueAtClaim: number | null;
  txHash: string;
}

/** Full vesting data returned by the hook. */
export interface VestingData {
  schedules: VestingSchedule[];
  upcomingUnlocks: UpcomingUnlock[];
  claimHistory: ClaimRecord[];
}
