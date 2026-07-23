import { sha256 } from '@/src/lib/crypto'
import { openBalanceDb } from '@/src/services/balanceIndexedDB'
import { openDatabase, StoreName, type InspectionDraft, type SubmissionQueueItem, type CachedDataEntry } from '@/src/services/db/schema'
import type {
  DatabaseBackup,
  SerializedDraft,
  SerializedQueueItem,
  SerializedCacheEntry,
  BackupReport,
  BackupState,
} from '@/src/types/databaseBackup'
import type { StoredBalanceBlock } from '@/src/types/balance'

const BACKUP_VERSION = 1

const STORE_NAMES = Object.values(StoreName) as StoreName[]

export class BackupService {
  private scheduleTimer: ReturnType<typeof setInterval> | null = null
  private state: BackupState = {
    lastBackupTime: null,
    lastVerifyTime: null,
    lastRestoreTime: null,
    backupStatus: 'idle',
    verifyStatus: 'idle',
    restoreStatus: 'idle',
    lastError: null,
    checksumMismatch: false,
    scheduleIntervalMs: 3600000,
  }

  private listeners: Set<(state: BackupState) => void> = new Set()

  getState(): BackupState {
    return { ...this.state }
  }

  subscribe(listener: (state: BackupState) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private notify(): void {
    const state = this.getState()
    this.listeners.forEach((fn) => fn(state))
  }

  private setState(partial: Partial<BackupState>): void {
    this.state = { ...this.state, ...partial }
    this.notify()
  }

  async exportDatabase(): Promise<DatabaseBackup> {
    const [balanceBlocks, offlineData] = await Promise.all([
      this.exportBalanceHistory(),
      this.exportOfflineStorage(),
    ])

    const backup: DatabaseBackup = {
      version: BACKUP_VERSION,
      createdAt: Date.now(),
      checksum: '',
      databases: {},
    }

    if (balanceBlocks.length > 0) {
      backup.databases.balanceHistory = {
        blocks: balanceBlocks,
        blockCount: balanceBlocks.length,
      }
    }

    if (
      offlineData.inspectionDrafts.length > 0 ||
      offlineData.submissionQueue.length > 0 ||
      offlineData.cachedData.length > 0
    ) {
      backup.databases.offlineStorage = offlineData
    }

    const serialized = JSON.stringify(backup)
    backup.checksum = await sha256(serialized)

    return backup
  }

  async runBackup(): Promise<BackupReport> {
    this.setState({ backupStatus: 'running', lastError: null })
    const start = Date.now()

    try {
      const backup = await this.exportDatabase()
      const serialized = JSON.stringify(backup)
      const report: BackupReport = {
        timestamp: backup.createdAt,
        backupSize: new Blob([serialized]).size,
        blockCount: backup.databases.balanceHistory?.blockCount ?? 0,
        draftCount: backup.databases.offlineStorage?.inspectionDrafts.length ?? 0,
        queueCount: backup.databases.offlineStorage?.submissionQueue.length ?? 0,
        cacheCount: backup.databases.offlineStorage?.cachedData.length ?? 0,
        checksum: backup.checksum,
        duration: Date.now() - start,
        verified: false,
      }

      const verifyResult = await this.verifyBackupIntegrity(backup)
      report.verified = verifyResult

      this.setState({
        backupStatus: 'success',
        lastBackupTime: backup.createdAt,
        checksumMismatch: !verifyResult,
      })

      return report
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown backup error'
      this.setState({ backupStatus: 'failure', lastError: message })
      throw err
    }
  }

  private async exportBalanceHistory(): Promise<StoredBalanceBlock[]> {
    if (typeof indexedDB === 'undefined') return []
    const db = await openBalanceDb()
    try {
      return await new Promise<StoredBalanceBlock[]>((resolve, reject) => {
        const tx = db.transaction('compressed-balances', 'readonly')
        const store = tx.objectStore('compressed-balances')
        const request = store.getAll()
        request.onsuccess = () => resolve((request.result as StoredBalanceBlock[]) ?? [])
        request.onerror = () => reject(request.error)
      })
    } finally {
      db.close()
    }
  }

  private async exportOfflineStorage(): Promise<{
    inspectionDrafts: SerializedDraft[]
    submissionQueue: SerializedQueueItem[]
    cachedData: SerializedCacheEntry[]
  }> {
    if (typeof indexedDB === 'undefined') {
      return { inspectionDrafts: [], submissionQueue: [], cachedData: [] }
    }

    const db = await openDatabase()
    try {
      const [drafts, queue, cache] = await Promise.all([
        this.getAllFromStore<InspectionDraft>(db, StoreName.InspectionDrafts),
        this.getAllFromStore<SubmissionQueueItem>(db, StoreName.SubmissionQueue),
        this.getAllFromStore<CachedDataEntry>(db, StoreName.CachedData),
      ])

      return {
        inspectionDrafts: drafts.map((d) => ({
          draftId: d.draftId,
          data: arrayBufferToBase64(d.data),
          createdAt: d.createdAt,
          updatedAt: d.updatedAt,
          version: d.version,
        })),
        submissionQueue: queue.map((q) => ({
          queueId: q.queueId,
          payload: arrayBufferToBase64(q.payload),
          createdAt: q.createdAt,
          retryCount: q.retryCount,
        })),
        cachedData: cache.map((c) => ({
          cacheKey: c.cacheKey,
          data: arrayBufferToBase64(c.data),
          createdAt: c.createdAt,
          expiresAt: c.expiresAt,
          version: c.version,
        })),
      }
    } finally {
      db.close()
    }
  }

  private getAllFromStore<T>(db: IDBDatabase, storeName: StoreName): Promise<T[]> {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly')
      const store = tx.objectStore(storeName)
      const request = store.getAll()
      request.onsuccess = () => resolve((request.result as T[]) ?? [])
      request.onerror = () => reject(request.error)
    })
  }

  async verifyBackupIntegrity(backup?: DatabaseBackup): Promise<boolean> {
    this.setState({ verifyStatus: 'running', lastError: null })

    try {
      const target = backup ?? (await this.exportDatabase())
      const serialized = JSON.stringify({ ...target, checksum: '' })
      const computed = await sha256(serialized)

      const valid = computed === target.checksum

      const [balanceOk, offlineOk] = await Promise.all([
        this.verifyBalanceHistory(target),
        this.verifyOfflineStorage(target),
      ])

      const passed = valid && balanceOk && offlineOk

      this.setState({
        verifyStatus: passed ? 'passed' : 'failed',
        lastVerifyTime: Date.now(),
        checksumMismatch: !passed,
        lastError: passed ? null : 'Database integrity verification failed',
      })

      return passed
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown verify error'
      this.setState({ verifyStatus: 'failed', lastError: message })
      return false
    }
  }

  private async verifyBalanceHistory(backup: DatabaseBackup): Promise<boolean> {
    if (!backup.databases.balanceHistory) return true
    const blocks = backup.databases.balanceHistory.blocks
    for (const block of blocks) {
      if (block.lastEpoch < block.baseEpoch) return false
    }
    return true
  }

  private async verifyOfflineStorage(backup: DatabaseBackup): Promise<boolean> {
    const offline = backup.databases.offlineStorage
    if (!offline) return true
    for (const draft of offline.inspectionDrafts) {
      if (!draft.draftId || draft.version < 1) return false
    }
    return true
  }

  async restoreFromBackup(backup: DatabaseBackup): Promise<void> {
    this.setState({ restoreStatus: 'running', lastError: null })

    try {
      const serialized = JSON.stringify({ ...backup, checksum: '' })
      const computed = await sha256(serialized)
      if (computed !== backup.checksum) {
        throw new Error('Backup checksum mismatch: data may be corrupted')
      }

      if (backup.databases.balanceHistory) {
        await this.restoreBalanceHistory(backup.databases.balanceHistory.blocks)
      }

      if (backup.databases.offlineStorage) {
        await this.restoreOfflineStorage(backup.databases.offlineStorage)
      }

      this.setState({
        restoreStatus: 'success',
        lastRestoreTime: Date.now(),
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown restore error'
      this.setState({ restoreStatus: 'failure', lastError: message })
      throw err
    }
  }

  private async restoreBalanceHistory(blocks: StoredBalanceBlock[]): Promise<void> {
    if (typeof indexedDB === 'undefined') return
    const db = await openBalanceDb()
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('compressed-balances', 'readwrite')
        const store = tx.objectStore('compressed-balances')
        store.clear()
        for (const block of blocks) {
          store.put(block)
        }
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
      })
    } finally {
      db.close()
    }
  }

  private async restoreOfflineStorage(offline: {
    inspectionDrafts: SerializedDraft[]
    submissionQueue: SerializedQueueItem[]
    cachedData: SerializedCacheEntry[]
  }): Promise<void> {
    if (typeof indexedDB === 'undefined') return
    const db = await openDatabase()
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAMES, 'readwrite')
        for (const name of STORE_NAMES) {
          tx.objectStore(name).clear()
        }
        for (const draft of offline.inspectionDrafts) {
          tx.objectStore(StoreName.InspectionDrafts).put({
            draftId: draft.draftId,
            data: base64ToArrayBuffer(draft.data),
            createdAt: draft.createdAt,
            updatedAt: draft.updatedAt,
            version: draft.version,
          })
        }
        for (const item of offline.submissionQueue) {
          tx.objectStore(StoreName.SubmissionQueue).put({
            payload: base64ToArrayBuffer(item.payload),
            createdAt: item.createdAt,
            retryCount: item.retryCount,
          })
        }
        for (const entry of offline.cachedData) {
          tx.objectStore(StoreName.CachedData).put({
            cacheKey: entry.cacheKey,
            data: base64ToArrayBuffer(entry.data),
            createdAt: entry.createdAt,
            expiresAt: entry.expiresAt,
            version: entry.version,
          })
        }
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
      })
    } finally {
      db.close()
    }
  }

  async exportBackupToJson(): Promise<string> {
    const backup = await this.exportDatabase()
    return JSON.stringify(backup, null, 2)
  }

  async importBackupFromJson(json: string): Promise<void> {
    const backup: DatabaseBackup = JSON.parse(json)
    if (backup.version !== BACKUP_VERSION) {
      throw new Error(`Unsupported backup version: ${backup.version}`)
    }
    await this.restoreFromBackup(backup)
  }

  startScheduledVerification(intervalMs?: number): void {
    const ms = intervalMs ?? this.state.scheduleIntervalMs
    this.stopScheduledVerification()
    this.scheduleTimer = setInterval(() => {
      this.verifyBackupIntegrity().catch(() => {})
    }, ms)
  }

  stopScheduledVerification(): void {
    if (this.scheduleTimer !== null) {
      clearInterval(this.scheduleTimer)
      this.scheduleTimer = null
    }
  }

  async runFullBackupCycle(): Promise<BackupReport> {
    const report = await this.runBackup()
    await this.verifyBackupIntegrity()
    return report
  }
}

export const backupService = new BackupService()

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes.buffer
}
