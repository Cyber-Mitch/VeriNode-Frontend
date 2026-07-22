import { backupService } from '@/src/services/db/backupService'
import { useBackupStore } from '@/src/services/db/backupStore'
import { pruneOldBalances } from '@/src/services/balanceIndexedDB'

const DEFAULT_BACKUP_INTERVAL_MS = 3600000
const DEFAULT_VERIFY_INTERVAL_MS = 7200000
const DEFAULT_PRUNE_INTERVAL_MS = 86400000

export class DatabaseHealthMonitor {
  private backupTimer: ReturnType<typeof setInterval> | null = null
  private verifyTimer: ReturnType<typeof setInterval> | null = null
  private pruneTimer: ReturnType<typeof setInterval> | null = null
  private started = false
  private unsubscribe: (() => void) | null = null

  start(options?: {
    backupIntervalMs?: number
    verifyIntervalMs?: number
    pruneIntervalMs?: number
  }): void {
    if (this.started) return
    this.started = true

    const backupMs = options?.backupIntervalMs ?? DEFAULT_BACKUP_INTERVAL_MS
    const verifyMs = options?.verifyIntervalMs ?? DEFAULT_VERIFY_INTERVAL_MS
    const pruneMs = options?.pruneIntervalMs ?? DEFAULT_PRUNE_INTERVAL_MS

    this.unsubscribe = backupService.subscribe((state) => {
      const store = useBackupStore.getState()
      store.setBackupStatus(state.backupStatus)
      store.setLastBackupTime(state.lastBackupTime)
      store.setVerifyStatus(state.verifyStatus)
      store.setLastVerifyTime(state.lastVerifyTime)
      store.setRestoreStatus(state.restoreStatus)
      store.setLastRestoreTime(state.lastRestoreTime)
      store.setLastError(state.lastError)
      store.setChecksumMismatch(state.checksumMismatch)
    })

    this.backupTimer = setInterval(() => {
      backupService.runBackup().catch(() => {})
    }, backupMs)

    this.verifyTimer = setInterval(() => {
      backupService.verifyBackupIntegrity().catch(() => {})
    }, verifyMs)

    this.pruneTimer = setInterval(() => {
      pruneOldBalances().catch(() => {})
    }, pruneMs)

    useBackupStore.getState().setIsScheduled(true)

    backupService.runBackup().catch(() => {})
  }

  stop(): void {
    this.started = false

    if (this.backupTimer !== null) {
      clearInterval(this.backupTimer)
      this.backupTimer = null
    }

    if (this.verifyTimer !== null) {
      clearInterval(this.verifyTimer)
      this.verifyTimer = null
    }

    if (this.pruneTimer !== null) {
      clearInterval(this.pruneTimer)
      this.pruneTimer = null
    }

    if (this.unsubscribe) {
      this.unsubscribe()
      this.unsubscribe = null
    }

    useBackupStore.getState().setIsScheduled(false)
  }

  isRunning(): boolean {
    return this.started
  }
}

export const databaseHealthMonitor = new DatabaseHealthMonitor()
