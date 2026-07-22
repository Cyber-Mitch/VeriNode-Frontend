/**
 * IndexedDB audit store for voluntary exit workflow.
 *
 * Each unsigned message is logged with its SHA-256 hash, validator index,
 * timestamp, and eventual broadcast status, forming a tamper-evident audit
 * trail for compliance.
 */

export type ExitBroadcastStatus = 'pending' | 'broadcast' | 'failed' | 'aborted';

export interface ExitAuditEntry {
  /** Unique entry ID */
  id: string;
  /** Validator index this exit relates to */
  validatorIndex: number;
  /** Beacon-chain epoch at which the exit was initiated */
  epoch: number;
  /** SHA-256 hex of the SSZ-encoded unsigned exit message */
  unsignedMsgHash: string;
  /** ISO-8601 timestamp when the entry was created */
  timestamp: number;
  /** Broadcast status, updated as the workflow progresses */
  broadcastStatus: ExitBroadcastStatus;
  /** Optional operator account identifier */
  operatorId?: string;
  /** Error description when broadcastStatus === 'failed' */
  errorDetail?: string;
}

const DB_NAME = 'exit_audit_db';
const DB_VERSION = 1;
const STORE_NAME = 'exit_audit';

async function openExitAuditDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(new Error('Failed to open exit audit database'));
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('validatorIndex', 'validatorIndex', { unique: false });
        store.createIndex('timestamp', 'timestamp', { unique: false });
        store.createIndex('broadcastStatus', 'broadcastStatus', { unique: false });
        store.createIndex('unsignedMsgHash', 'unsignedMsgHash', { unique: false });
      }
    };
  });
}

/** Persists a new audit entry. */
export async function saveExitAuditEntry(entry: ExitAuditEntry): Promise<void> {
  const db = await openExitAuditDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_NAME], 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.put(entry);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => reject(new Error('Failed to save exit audit entry'));
  });
}

/** Updates the broadcast status of an existing entry. */
export async function updateExitAuditStatus(
  id: string,
  broadcastStatus: ExitBroadcastStatus,
  errorDetail?: string,
): Promise<void> {
  const db = await openExitAuditDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_NAME], 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const getReq = store.get(id);
    getReq.onsuccess = () => {
      const existing = getReq.result as ExitAuditEntry | undefined;
      if (!existing) { resolve(); return; }
      store.put({ ...existing, broadcastStatus, ...(errorDetail ? { errorDetail } : {}) });
    };
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => reject(new Error('Failed to update exit audit entry'));
  });
}

/** Returns all audit entries, sorted by timestamp ascending. */
export async function getAllExitAuditEntries(): Promise<ExitAuditEntry[]> {
  const db = await openExitAuditDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_NAME], 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.getAll();
    req.onsuccess = () => {
      const entries = (req.result as ExitAuditEntry[]) ?? [];
      entries.sort((a, b) => a.timestamp - b.timestamp);
      resolve(entries);
    };
    req.onerror = () => reject(new Error('Failed to read exit audit entries'));
    tx.oncomplete = () => db.close();
  });
}

/** Returns audit entries for a specific validator, sorted by timestamp. */
export async function getExitAuditEntriesByValidator(
  validatorIndex: number,
): Promise<ExitAuditEntry[]> {
  const db = await openExitAuditDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_NAME], 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const index = store.index('validatorIndex');
    const req = index.getAll(validatorIndex);
    req.onsuccess = () => {
      const entries = (req.result as ExitAuditEntry[]) ?? [];
      entries.sort((a, b) => a.timestamp - b.timestamp);
      resolve(entries);
    };
    req.onerror = () => reject(new Error('Failed to read exit audit entries by validator'));
    tx.oncomplete = () => db.close();
  });
}

/** Generates a unique entry ID. */
export function generateExitAuditId(): string {
  const ts = Date.now().toString(36);
  const rnd = Math.random().toString(36).slice(2, 10);
  return `exit_${ts}_${rnd}`;
}
