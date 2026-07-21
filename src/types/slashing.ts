/**
 * Slashing event types for real-time monitoring of node slashing events.
 */

export interface SlashingEvent {
  /** Unique event identifier */
  id: string;
  /** Node identifier that was slashed */
  nodeId: string;
  /** Unix timestamp in milliseconds */
  timestamp: number;
  /** Slash amount in ETH */
  amount: number;
  /** Slot at which slashing occurred */
  slot: number;
  /** Epoch at which slashing occurred */
  epoch: number;
  /** Optional description of the slashing reason */
  reason?: string;
  /** Event sequence number for ordering */
  seq: number;
}

export interface UseSlashingStreamOptions {
  /** WebSocket URL for slashing event stream */
  url: string;
  /** Enable the stream (default: true) */
  enabled?: boolean;
  /** Deduplication window in milliseconds (default: 300000 = 5 minutes) */
  dedupWindowMs?: number;
  /** Callback when new events arrive */
  onEvents?: (events: SlashingEvent[]) => void;
}

export interface UseSlashingStreamResult {
  /** Currently received slashing events */
  events: SlashingEvent[];
  /** WebSocket connection status */
  connected: boolean;
  /** Error message if any */
  error: string | null;
  /** Last event ID successfully received */
  lastEventId: string | null;
}
