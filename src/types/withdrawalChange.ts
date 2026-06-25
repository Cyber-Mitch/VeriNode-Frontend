/**
 * Types for BLS-to-Execution withdrawal credential changes with multi-sig governance
 */

/** BLSToExecutionChange message format per Ethereum consensus spec */
export interface BLSToExecutionChangeMessage {
  /** Validator index on the beacon chain */
  validatorIndex: number;
  /** Current BLS withdrawal credentials pubkey (0x00...) */
  fromBlsPubkey: string;
  /** Target execution layer address (0x01...) */
  toExecutionAddress: string;
}

/** Request state machine states */
export type ChangeRequestState =
  | 'draft'
  | 'pending_approval'
  | 'approved'
  | 'broadcast'
  | 'confirmed'
  | 'failed'
  | 'expired';

/** ECDSA signature over the SHA-256 hash of SSZ-encoded message */
export interface ApproverSignature {
  /** Ethereum address of the approver */
  approverAddress: string;
  /** ECDSA signature (hex string) */
  signature: string;
  /** Timestamp of signature submission (unix-ms) */
  timestamp: number;
  /** Optional comment from approver */
  comment?: string;
}

/** Change request with full lifecycle tracking */
export interface WithdrawalChangeRequest {
  /** Unique request ID */
  id: string;
  /** BLS change message */
  message: BLSToExecutionChangeMessage;
  /** SSZ-encoded message (hex) */
  sszEncoded: string;
  /** SHA-256 hash of SSZ-encoded message (hex) */
  messageHash: string;
  /** Current state */
  state: ChangeRequestState;
  /** Creation timestamp (unix-ms) */
  createdAt: number;
  /** Last update timestamp (unix-ms) */
  updatedAt: number;
  /** Expiry timestamp (unix-ms) - 7 days from creation */
  expiresAt: number;
  /** Collected signatures */
  signatures: ApproverSignature[];
  /** Required threshold (N-of-M) */
  threshold: number;
  /** List of eligible approver addresses */
  approvers: string[];
  /** Beacon chain transaction hash (when broadcast) */
  txHash?: string;
  /** Error message (when failed) */
  error?: string;
  /** Request initiator address */
  initiator: string;
}

/** Governance configuration */
export interface GovernanceConfig {
  /** Required number of approvals */
  threshold: number;
  /** Total number of approvers */
  totalApprovers: number;
  /** List of approver addresses */
  approvers: string[];
  /** Request expiry duration in ms (default: 7 days) */
  expiryDuration: number;
}

/** Audit log entry with hash chain for tamper-evidence */
export interface AuditLogEntry {
  /** Unique entry ID */
  id: string;
  /** Request ID this entry relates to */
  requestId: string;
  /** Event type */
  eventType: 'created' | 'signature_added' | 'state_changed' | 'broadcast' | 'confirmed' | 'failed' | 'expired';
  /** Event timestamp (unix-ms) */
  timestamp: number;
  /** Actor address (who performed the action) */
  actor: string;
  /** Previous state (for state changes) */
  previousState?: ChangeRequestState;
  /** New state (for state changes) */
  newState?: ChangeRequestState;
  /** Additional event data */
  data?: Record<string, unknown>;
  /** SHA-256 hash of this entry */
  entryHash: string;
  /** Hash of previous entry (for chain integrity) */
  previousHash: string;
}

/** Notification request for approvers */
export interface ApproverNotification {
  requestId: string;
  validatorIndex: number;
  approverAddress: string;
  notificationType: 'email' | 'web3' | 'both';
  sentAt?: number;
  status: 'pending' | 'sent' | 'failed';
}

/** Progress tracking for UI */
export interface ApprovalProgress {
  requestId: string;
  collected: number;
  required: number;
  percentage: number;
  remainingApprovers: string[];
  isComplete: boolean;
  hoursUntilExpiry: number;
}

/** Domain type for BLS signature */
export const DOMAIN_BLS_TO_EXECUTION_CHANGE = '0x0A000000' as const;

/** Request expiry duration (7 days in milliseconds) */
export const REQUEST_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;

/** Maximum concurrent requests per instance */
export const MAX_CONCURRENT_REQUESTS = 50;
