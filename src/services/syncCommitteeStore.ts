// IndexedDB cache for sync committee period data, with a 7-day TTL.
//
// Period data is expensive to assemble (8,192 per-slot bits per assigned
// period) and immutable once a period is in the past, so it is cached per
// (validator, period). Entries expire after 7 days and are pruned lazily on
// read and via an explicit GC pass.

import type { SyncCommitteePeriodData } from '@/src/utils/syncCommittee'

const DB_NAME = 'verinode-sync-committee'
const STORE_NAME = 'periods'
const VERSION = 1
const INDEX_EXPIRES = 'expiresAt'
const TTL_MS = 7 * 24 * 60 * 60 * 1000

interface StoredPeriod {
  key: string // `${validatorIndex}:${period}`
  validatorIndex: number
  period: number
  startEpoch: number
  endEpoch: number
  assigned: boolean
  participation: Uint8Array
  participatedCount: number
  totalSlots: number
  participationRate: number
  expiresAt: number
}

function periodKey(validatorIndex: number, period: number): string {
  return `${validatorIndex}:${period}`
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'key' })
        store.createIndex(INDEX_EXPIRES, 'expiresAt', { unique: false })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function toStored(data: SyncCommitteePeriodData, now: number): StoredPeriod {
  return {
    key: periodKey(data.validatorIndex, data.period),
    validatorIndex: data.validatorIndex,
    period: data.period,
    startEpoch: data.startEpoch,
    endEpoch: data.endEpoch,
    assigned: data.assigned,
    participation: data.participation,
    participatedCount: data.participatedCount,
    totalSlots: data.totalSlots,
    participationRate: data.participationRate,
    expiresAt: now + TTL_MS,
  }
}

function fromStored(stored: StoredPeriod): SyncCommitteePeriodData {
  return {
    validatorIndex: stored.validatorIndex,
    period: stored.period,
    startEpoch: stored.startEpoch,
    endEpoch: stored.endEpoch,
    assigned: stored.assigned,
    participation: stored.participation,
    participatedCount: stored.participatedCount,
    totalSlots: stored.totalSlots,
    participationRate: stored.participationRate,
  }
}

/** Persist one period's data with a fresh 7-day TTL. */
export async function savePeriod(data: SyncCommitteePeriodData, now = Date.now()): Promise<void> {
  if (typeof indexedDB === 'undefined') return
  const db = await openDb()
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      tx.objectStore(STORE_NAME).put(toStored(data, now))
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } finally {
    db.close()
  }
}

/** Read a cached period, or null on miss/expiry (expired entries are deleted). */
export async function getPeriod(
  validatorIndex: number,
  period: number,
  now = Date.now(),
): Promise<SyncCommitteePeriodData | null> {
  if (typeof indexedDB === 'undefined') return null
  const db = await openDb()
  try {
    const key = periodKey(validatorIndex, period)
    const stored = await new Promise<StoredPeriod | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const request = tx.objectStore(STORE_NAME).get(key)
      request.onsuccess = () => resolve(request.result as StoredPeriod | undefined)
      request.onerror = () => reject(request.error)
    })

    if (!stored) return null
    if (stored.expiresAt <= now) {
      await deletePeriod(validatorIndex, period)
      return null
    }
    return fromStored(stored)
  } finally {
    db.close()
  }
}

export async function deletePeriod(validatorIndex: number, period: number): Promise<void> {
  if (typeof indexedDB === 'undefined') return
  const db = await openDb()
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      tx.objectStore(STORE_NAME).delete(periodKey(validatorIndex, period))
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } finally {
    db.close()
  }
}

/** GC every entry whose TTL has elapsed. Returns the number removed. */
export async function pruneExpiredPeriods(now = Date.now()): Promise<number> {
  if (typeof indexedDB === 'undefined') return 0
  const db = await openDb()
  let removed = 0
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const index = tx.objectStore(STORE_NAME).index(INDEX_EXPIRES)
      const request = index.openCursor(IDBKeyRange.upperBound(now, true))
      request.onsuccess = () => {
        const cursor = request.result
        if (cursor) {
          cursor.delete()
          removed++
          cursor.continue()
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
