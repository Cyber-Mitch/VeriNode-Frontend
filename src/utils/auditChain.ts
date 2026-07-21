/**
 * Tamper-evident audit log with SHA-256 hash chain
 * 
 * Each entry includes the hash of the previous entry, creating a blockchain-like
 * structure that makes tampering detectable.
 */

import type { AuditLogEntry, ChangeRequestState } from '@/types/withdrawalChange';
import { sha256 } from './blsToExecutionChange';

/**
 * Computes hash of an audit log entry
 */
export async function computeEntryHash(
  entry: Omit<AuditLogEntry, 'entryHash'>
): Promise<string> {
  // Create canonical string representation
  const canonical = JSON.stringify({
    id: entry.id,
    requestId: entry.requestId,
    eventType: entry.eventType,
    timestamp: entry.timestamp,
    actor: entry.actor,
    previousState: entry.previousState,
    newState: entry.newState,
    data: entry.data,
    previousHash: entry.previousHash,
  });

  // Compute SHA-256 hash
  const encoder = new TextEncoder();
  const data = encoder.encode(canonical);
  const hashBytes = await sha256(data);
  
  // Convert to hex string
  return '0x' + Array.from(hashBytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Creates a new audit log entry
 */
export async function createAuditEntry(
  requestId: string,
  eventType: AuditLogEntry['eventType'],
  actor: string,
  previousHash: string,
  options?: {
    previousState?: ChangeRequestState;
    newState?: ChangeRequestState;
    data?: Record<string, unknown>;
  }
): Promise<AuditLogEntry> {
  const id = generateEntryId();
  const timestamp = Date.now();

  const entryWithoutHash: Omit<AuditLogEntry, 'entryHash'> = {
    id,
    requestId,
    eventType,
    timestamp,
    actor,
    previousState: options?.previousState,
    newState: options?.newState,
    data: options?.data,
    previousHash,
  };

  const entryHash = await computeEntryHash(entryWithoutHash);

  return {
    ...entryWithoutHash,
    entryHash,
  };
}

/**
 * Verifies the integrity of the audit chain
 */
export async function verifyAuditChain(entries: AuditLogEntry[]): Promise<{
  valid: boolean;
  errors: string[];
  lastValidIndex: number;
}> {
  const errors: string[] = [];
  let lastValidIndex = -1;

  if (entries.length === 0) {
    return { valid: true, errors: [], lastValidIndex: -1 };
  }

  // Sort entries by timestamp
  const sortedEntries = [...entries].sort((a, b) => a.timestamp - b.timestamp);

  // Verify first entry has genesis hash
  if (sortedEntries[0].previousHash !== '0x0000000000000000000000000000000000000000000000000000000000000000') {
    errors.push('First entry must have genesis hash as previousHash');
  }

  // Verify each entry's hash
  for (let i = 0; i < sortedEntries.length; i++) {
    const entry = sortedEntries[i];
    
    // Verify entry hash
    const entryWithoutHash: Omit<AuditLogEntry, 'entryHash'> = {
      id: entry.id,
      requestId: entry.requestId,
      eventType: entry.eventType,
      timestamp: entry.timestamp,
      actor: entry.actor,
      previousState: entry.previousState,
      newState: entry.newState,
      data: entry.data,
      previousHash: entry.previousHash,
    };
    
    const expectedHash = await computeEntryHash(entryWithoutHash);
    if (expectedHash !== entry.entryHash) {
      errors.push(`Entry ${i} (${entry.id}): Hash mismatch`);
      break; // Stop at first tampered entry
    }

    // Verify chain linkage
    if (i > 0) {
      const previousEntry = sortedEntries[i - 1];
      if (entry.previousHash !== previousEntry.entryHash) {
        errors.push(`Entry ${i} (${entry.id}): Previous hash doesn't match previous entry`);
        break;
      }
    }

    lastValidIndex = i;
  }

  return {
    valid: errors.length === 0,
    errors,
    lastValidIndex,
  };
}

/**
 * Gets the genesis hash (for the first entry in a chain)
 */
export function getGenesisHash(): string {
  return '0x0000000000000000000000000000000000000000000000000000000000000000';
}

/**
 * Generates unique entry ID
 */
function generateEntryId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 15);
  return `audit_${timestamp}_${random}`;
}

/**
 * Formats audit log entry for display
 */
export function formatAuditEntry(entry: AuditLogEntry): string {
  const timestamp = new Date(entry.timestamp).toISOString();
  const parts = [
    `[${timestamp}]`,
    `Event: ${entry.eventType}`,
    `Actor: ${entry.actor}`,
  ];

  if (entry.previousState && entry.newState) {
    parts.push(`State: ${entry.previousState} → ${entry.newState}`);
  }

  if (entry.data) {
    parts.push(`Data: ${JSON.stringify(entry.data)}`);
  }

  return parts.join(' | ');
}

/**
 * Exports audit chain for verification or backup
 */
export function exportAuditChain(entries: AuditLogEntry[]): string {
  return JSON.stringify(
    {
      version: '1.0',
      exportedAt: Date.now(),
      entries: entries.sort((a, b) => a.timestamp - b.timestamp),
    },
    null,
    2
  );
}

/**
 * Imports audit chain from export
 */
export function importAuditChain(json: string): AuditLogEntry[] {
  try {
    const parsed = JSON.parse(json);
    if (!parsed.version || !Array.isArray(parsed.entries)) {
      throw new Error('Invalid audit chain format');
    }
    return parsed.entries;
  } catch (error) {
    throw new Error(`Failed to import audit chain: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
