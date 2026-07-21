// IndexedDB persistence for committee assignment history.
//
// Stores one record per epoch keyed by epoch number, retaining the most recent
// RETENTION_EPOCHS (256). Older epochs are pruned on write and via an explicit
// GC pass.

import { RETENTION_EPOCHS, type EpochAssignments } from '@/src/types/committee'

const DB_NAME = 'verinode-committee-history'
const STORE_NAME = 'epoch-assignments'
const VERSION = 1

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'epoch' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

/** Persist one epoch's assignments, then prune beyond the retention window. */
export async function saveEpochAssignments(
  data: EpochAssignments,
  retention = RETENTION_EPOCHS,
): Promise<void> {
  if (typeof indexedDB === 'undefined') return
  const db = await openDb()
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      tx.objectStore(STORE_NAME).put(data)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    await pruneCommitteeHistory(retention)
  } finally {
    db.close()
  }
}

/** Load all retained epochs, ascending by epoch. */
export async function loadEpochHistory(): Promise<EpochAssignments[]> {
  if (typeof indexedDB === 'undefined') return []
  const db = await openDb()
  try {
    const all = await new Promise<EpochAssignments[]>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const request = tx.objectStore(STORE_NAME).getAll()
      request.onsuccess = () => resolve((request.result as EpochAssignments[]) ?? [])
      request.onerror = () => reject(request.error)
    })
    return all.sort((a, b) => a.epoch - b.epoch)
  } finally {
    db.close()
  }
}

/** Delete the oldest epochs so at most `retention` remain. Returns count removed. */
export async function pruneCommitteeHistory(retention = RETENTION_EPOCHS): Promise<number> {
  if (typeof indexedDB === 'undefined') return 0
  const db = await openDb()
  let removed = 0
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      const countRequest = store.count()
      countRequest.onsuccess = () => {
        const excess = countRequest.result - retention
        if (excess <= 0) {
          resolve()
          return
        }
        // Epochs are the keys; the keyed cursor walks ascending (oldest first).
        const cursorRequest = store.openCursor()
        cursorRequest.onsuccess = () => {
          const cursor = cursorRequest.result
          if (cursor && removed < excess) {
            cursor.delete()
            removed++
            cursor.continue()
          }
        }
      }
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } finally {
    db.close()
  }
  return removed
}
