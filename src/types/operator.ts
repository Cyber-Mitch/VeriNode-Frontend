// Types for the Node Operator Dashboard (validator performance metrics).
//
// Live metrics arrive over WebSocket; historical series are composed from the
// existing balance/reward hooks. All percentages are 0..100.

/** Point-in-time validator metrics streamed live over WebSocket. */
export interface LiveOperatorMetrics {
  /** Current beacon-chain epoch. */
  currentEpoch: number;
  /** Current slot. */
  currentSlot: number;
  /** Latest finalized block/slot number. */
  finalizedBlock: number;
  /** Validator effective balance, in Gwei. */
  validatorBalanceGwei: bigint;
  /** Overall attestation effectiveness, 0..100. */
  effectivenessPct: number;
  /** Activation/exit queue position; null once the validator is active. */
  queuePosition: number | null;
  /** Attestation effectiveness component, 0..100. */
  attestationEffectivenessPct: number;
  /** Proposal timeliness component, 0..100. */
  proposalTimelinessPct: number;
  /** Uptime component, 0..100. */
  uptimePct: number;
  /** Connected peer count. */
  peerCount: number;
  /** Timestamp (ms since epoch) the metrics were observed. */
  updatedAt: number;
}

/** A validator-balance observation at an epoch (Gwei). */
export interface BalanceHistoryPoint {
  epoch: number;
  balanceGwei: bigint;
}

/** Attestation effectiveness (0..100) at an epoch. */
export interface AttestationEffectivenessPoint {
  epoch: number;
  effectivenessPct: number;
}

/** A block proposal event on the timeline. */
export interface ProposalPoint {
  slot: number;
  epoch: number;
  /** ms since epoch. */
  timestamp: number;
  status: 'included' | 'missed' | 'orphaned';
}

/** Composite health grade buckets. */
export type HealthGrade = 'excellent' | 'good' | 'fair' | 'poor';

/** Result of the composite node-health calculation. */
export interface HealthScore {
  /** 0..100 composite score. */
  score: number;
  grade: HealthGrade;
  /** Weighted contribution (points) of each input to the score. */
  components: {
    attestationEffectiveness: number;
    proposalTimeliness: number;
    uptime: number;
    peerCount: number;
  };
}

/** Time range selector for charts and export. */
export type TimeRangePreset = '24h' | '7d' | '30d';
export type TimeRange =
  | { kind: 'preset'; preset: TimeRangePreset }
  | { kind: 'custom'; fromMs: number; toMs: number };

/** Historical series backing the performance charts. */
export interface OperatorHistory {
  balances: BalanceHistoryPoint[];
  attestationEffectiveness: AttestationEffectivenessPoint[];
  proposals: ProposalPoint[];
}
