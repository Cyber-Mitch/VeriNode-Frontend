// Validator exit-queue types.
//
// When validators request to exit (voluntarily or via slashing) they join a
// network-wide exit queue drained at the per-epoch churn limit. These types
// model both the network-level queue snapshot and a specific validator's
// position within it, plus the projected exit estimate.

/** Network-wide exit-queue state at one epoch boundary. */
export interface NetworkQueueSnapshot {
  epoch: number
  /** Unix-ms timestamp of the epoch boundary. */
  timestamp: number
  /** Total validators waiting in the exit queue. */
  queueDepth: number
  /** Validators that can leave the queue per epoch (activation/exit churn). */
  churnLimit: number
  /** New voluntary exits observed this epoch. */
  voluntaryExits: number
  /** New slashed exits this epoch (enter the queue after a 4-epoch delay). */
  slashedExits: number
  /** True when this snapshot was synthesized by gap interpolation. */
  interpolated?: boolean
}

/** A specific validator's position within the exit queue at an epoch. */
export interface ValidatorQueuePosition {
  validatorIndex: number
  epoch: number
  /** Validators ahead of this one in the queue. */
  positionOffset: number
  /** Slashed exits incur a 4-epoch delay before entering the queue. */
  slashed: boolean
}

/** Combined reading returned by the beacon RPC for one validator + epoch. */
export interface ExitQueueReading {
  network: NetworkQueueSnapshot
  position: ValidatorQueuePosition
}

/** Projected exit estimate derived from position + EWMA churn rate. */
export interface ExitQueueProjection {
  currentEpoch: number | null
  positionOffset: number
  queueDepth: number
  churnLimit: number
  /** EWMA-smoothed drain rate (validators/epoch). */
  ewmaChurn: number
  slashed: boolean
  /** Epochs until exit (includes the 4-epoch slashing delay when applicable). */
  epochsRemaining: number | null
  projectedExitEpoch: number | null
  projectedExitTimestamp: number | null
}
