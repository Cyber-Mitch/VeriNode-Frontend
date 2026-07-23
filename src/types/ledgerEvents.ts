// Decoded Soroban contract log events surfaced in the real-time alert pipeline.
//
// Raw events arrive from the Soroban RPC `getTransaction` response as an array
// of hex-encoded XDR topics plus a base64-encoded SCVal body. `decodeLedgerEvent`
// (see src/utils/hexDecoder.ts) turns those into one of the typed shapes below.

/** Contract event signatures we know how to decode. */
export type KnownLedgerEventType =
  | 'approve_attestation'
  | 'reject_attestation'
  | 'slash_node'
  | 'reward_distributed'
  | 'node_registered'
  | 'node_deregistered'
  | 'parameter_changed'

export type LedgerEventType = KnownLedgerEventType | 'unknown'

/** Drives color coding in the alert UI. */
export type AlertSeverity = 'error' | 'warning' | 'success' | 'info'

/** Fields shared by every decoded event, known or not. */
export interface BaseLedgerEvent {
  /** Stable id for memoization / dedupe (tx hash + event index when available). */
  id: string
  /** Human-readable title, e.g. "Node Slashed". */
  title: string
  severity: AlertSeverity
  /** True for events that may trigger an audible alert (slash / reject). */
  highSeverity: boolean
  /** Event time in epoch ms (ledger close time when known, else decode time). */
  timestamp: number
  /** Ledger sequence the event was emitted in, when provided by the source. */
  ledgerSeq: number | null
  /** Original wire data, retained for the "copy raw" / report affordances. */
  rawTopics: string[]
  rawBody: string
}

export interface ApproveAttestationEvent extends BaseLedgerEvent {
  type: 'approve_attestation'
  nodeId: string
  attestationId: string
  epoch: number | null
}

export interface RejectAttestationEvent extends BaseLedgerEvent {
  type: 'reject_attestation'
  nodeId: string
  attestationId: string
  reason: string
}

export interface SlashNodeEvent extends BaseLedgerEvent {
  type: 'slash_node'
  nodeId: string
  amount: string
  reason: string
}

export interface RewardDistributedEvent extends BaseLedgerEvent {
  type: 'reward_distributed'
  nodeId: string
  amount: string
  epoch: number | null
}

export interface NodeRegisteredEvent extends BaseLedgerEvent {
  type: 'node_registered'
  nodeId: string
  operator: string
}

export interface NodeDeregisteredEvent extends BaseLedgerEvent {
  type: 'node_deregistered'
  nodeId: string
  reason: string
}

export interface ParameterChangedEvent extends BaseLedgerEvent {
  type: 'parameter_changed'
  key: string
  oldValue: string
  newValue: string
}

export interface UnknownEvent extends BaseLedgerEvent {
  type: 'unknown'
  /** Decoded signature symbol if it parsed but wasn't recognized, else null. */
  signature: string | null
}

export type LedgerEvent =
  | ApproveAttestationEvent
  | RejectAttestationEvent
  | SlashNodeEvent
  | RewardDistributedEvent
  | NodeRegisteredEvent
  | NodeDeregisteredEvent
  | ParameterChangedEvent
  | UnknownEvent

/** Raw event envelope as it leaves the RPC / websocket source, pre-decode. */
export interface RawLedgerEvent {
  id: string
  /** Hex-encoded XDR topics (topic[0] is the event signature). */
  topics: string[]
  /** Base64-encoded SCVal event body. */
  body: string
  ledgerSeq?: number
  /** Ledger close time in epoch ms. */
  timestamp?: number
}
