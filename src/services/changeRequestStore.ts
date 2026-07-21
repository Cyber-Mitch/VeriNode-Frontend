/**
 * IndexedDB persistence for withdrawal change requests and audit logs
 * 
 * Provides durable storage with transaction support and efficient querying.
 */

import type { WithdrawalChangeRequest, AuditLogEntry } from '@/types/withdrawalChange';

const DB_NAME = 'withdrawal_credentials_db';
const DB_VERSION = 1;
const REQUESTS_STORE = 'change_requests';
const AUDIT_STORE = 'audit_logs';

/**
 * Opens or creates the IndexedDB database
 */
async function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(new Error('Failed to open database'));

    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // Create change requests store
      if (!db.objectStoreNames.contains(REQUESTS_STORE)) {
        const requestStore = db.createObjectStore(REQUESTS_STORE, { keyPath: 'id' });
        requestStore.createIndex('state', 'state', { unique: false });
        requestStore.createIndex('validatorIndex', 'message.validatorIndex', { unique: false });
        requestStore.createIndex('createdAt', 'createdAt', { unique: false });
        requestStore.createIndex('expiresAt', 'expiresAt', { unique: false });
        requestStore.createIndex('initiator', 'initiator', { unique: false });
      }

      // Create audit logs store
      if (!db.objectStoreNames.contains(AUDIT_STORE)) {
        const auditStore = db.createObjectStore(AUDIT_STORE, { keyPath: 'id' });
        auditStore.createIndex('requestId', 'requestId', { unique: false });
        auditStore.createIndex('timestamp', 'timestamp', { unique: false });
        auditStore.createIndex('eventType', 'eventType', { unique: false });
      }
    };
  });
}

/**
 * Saves a change request
 */
export async function saveChangeRequest(request: WithdrawalChangeRequest): Promise<void> {
  const db = await openDatabase();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([REQUESTS_STORE], 'readwrite');
    const store = transaction.objectStore(REQUESTS_STORE);
    const putRequest = store.put(request);

    putRequest.onsuccess = () => resolve();
    putRequest.onerror = () => reject(new Error('Failed to save change request'));
    
    transaction.oncomplete = () => db.close();
  });
}

/**
 * Gets a change request by ID
 */
export async function getChangeRequest(id: string): Promise<WithdrawalChangeRequest | null> {
  const db = await openDatabase();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([REQUESTS_STORE], 'readonly');
    const store = transaction.objectStore(REQUESTS_STORE);
    const getRequest = store.get(id);

    getRequest.onsuccess = () => resolve(getRequest.result ?? null);
    getRequest.onerror = () => reject(new Error('Failed to get change request'));
    
    transaction.oncomplete = () => db.close();
  });
}

/**
 * Gets all change requests
 */
export async function getAllChangeRequests(): Promise<WithdrawalChangeRequest[]> {
  const db = await openDatabase();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([REQUESTS_STORE], 'readonly');
    const store = transaction.objectStore(REQUESTS_STORE);
    const getAllRequest = store.getAll();

    getAllRequest.onsuccess = () => resolve(getAllRequest.result ?? []);
    getAllRequest.onerror = () => reject(new Error('Failed to get all change requests'));
    
    transaction.oncomplete = () => db.close();
  });
}

/**
 * Gets change requests by state
 */
export async function getChangeRequestsByState(
  state: WithdrawalChangeRequest['state']
): Promise<WithdrawalChangeRequest[]> {
  const db = await openDatabase();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([REQUESTS_STORE], 'readonly');
    const store = transaction.objectStore(REQUESTS_STORE);
    const index = store.index('state');
    const getRequest = index.getAll(state);

    getRequest.onsuccess = () => resolve(getRequest.result ?? []);
    getRequest.onerror = () => reject(new Error('Failed to get change requests by state'));
    
    transaction.oncomplete = () => db.close();
  });
}

/**
 * Gets change requests by validator index
 */
export async function getChangeRequestsByValidator(
  validatorIndex: number
): Promise<WithdrawalChangeRequest[]> {
  const db = await openDatabase();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([REQUESTS_STORE], 'readonly');
    const store = transaction.objectStore(REQUESTS_STORE);
    const index = store.index('validatorIndex');
    const getRequest = index.getAll(validatorIndex);

    getRequest.onsuccess = () => resolve(getRequest.result ?? []);
    getRequest.onerror = () => reject(new Error('Failed to get change requests by validator'));
    
    transaction.oncomplete = () => db.close();
  });
}

/**
 * Deletes a change request
 */
export async function deleteChangeRequest(id: string): Promise<void> {
  const db = await openDatabase();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([REQUESTS_STORE], 'readwrite');
    const store = transaction.objectStore(REQUESTS_STORE);
    const deleteRequest = store.delete(id);

    deleteRequest.onsuccess = () => resolve();
    deleteRequest.onerror = () => reject(new Error('Failed to delete change request'));
    
    transaction.oncomplete = () => db.close();
  });
}

/**
 * Saves an audit log entry
 */
export async function saveAuditEntry(entry: AuditLogEntry): Promise<void> {
  const db = await openDatabase();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([AUDIT_STORE], 'readwrite');
    const store = transaction.objectStore(AUDIT_STORE);
    const putRequest = store.put(entry);

    putRequest.onsuccess = () => resolve();
    putRequest.onerror = () => reject(new Error('Failed to save audit entry'));
    
    transaction.oncomplete = () => db.close();
  });
}

/**
 * Gets audit logs for a specific request
 */
export async function getAuditLogs(requestId: string): Promise<AuditLogEntry[]> {
  const db = await openDatabase();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([AUDIT_STORE], 'readonly');
    const store = transaction.objectStore(AUDIT_STORE);
    const index = store.index('requestId');
    const getRequest = index.getAll(requestId);

    getRequest.onsuccess = () => {
      const entries = getRequest.result ?? [];
      // Sort by timestamp
      entries.sort((a, b) => a.timestamp - b.timestamp);
      resolve(entries);
    };
    getRequest.onerror = () => reject(new Error('Failed to get audit logs'));
    
    transaction.oncomplete = () => db.close();
  });
}

/**
 * Gets all audit logs
 */
export async function getAllAuditLogs(): Promise<AuditLogEntry[]> {
  const db = await openDatabase();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([AUDIT_STORE], 'readonly');
    const store = transaction.objectStore(AUDIT_STORE);
    const getAllRequest = store.getAll();

    getAllRequest.onsuccess = () => {
      const entries = getAllRequest.result ?? [];
      entries.sort((a, b) => a.timestamp - b.timestamp);
      resolve(entries);
    };
    getAllRequest.onerror = () => reject(new Error('Failed to get all audit logs'));
    
    transaction.oncomplete = () => db.close();
  });
}

/**
 * Cleans up expired requests
 */
export async function cleanupExpiredRequests(): Promise<number> {
  const db = await openDatabase();
  const now = Date.now();
  let deletedCount = 0;
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([REQUESTS_STORE], 'readwrite');
    const store = transaction.objectStore(REQUESTS_STORE);
    const index = store.index('expiresAt');
    const range = IDBKeyRange.upperBound(now);
    const cursorRequest = index.openCursor(range);

    cursorRequest.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
      if (cursor) {
        const request = cursor.value as WithdrawalChangeRequest;
        if (request.state === 'pending_approval' || request.state === 'draft') {
          cursor.delete();
          deletedCount++;
        }
        cursor.continue();
      }
    };

    cursorRequest.onerror = () => reject(new Error('Failed to cleanup expired requests'));
    
    transaction.oncomplete = () => {
      db.close();
      resolve(deletedCount);
    };
  });
}

/**
 * Gets count of active requests (not expired, failed, or confirmed)
 */
export async function getActiveRequestCount(): Promise<number> {
  const db = await openDatabase();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([REQUESTS_STORE], 'readonly');
    const store = transaction.objectStore(REQUESTS_STORE);
    const getAllRequest = store.getAll();

    getAllRequest.onsuccess = () => {
      const requests = getAllRequest.result ?? [];
      const activeCount = requests.filter(r => 
        r.state !== 'failed' && 
        r.state !== 'confirmed' && 
        r.state !== 'expired' &&
        r.expiresAt > Date.now()
      ).length;
      resolve(activeCount);
    };
    getAllRequest.onerror = () => reject(new Error('Failed to count active requests'));
    
    transaction.oncomplete = () => db.close();
  });
}

/**
 * Clears all data (useful for testing)
 */
export async function clearAllData(): Promise<void> {
  const db = await openDatabase();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([REQUESTS_STORE, AUDIT_STORE], 'readwrite');
    
    transaction.objectStore(REQUESTS_STORE).clear();
    transaction.objectStore(AUDIT_STORE).clear();

    transaction.oncomplete = () => {
      db.close();
      resolve();
    };
    transaction.onerror = () => reject(new Error('Failed to clear data'));
  });
}
