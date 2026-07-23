import type { StoredBalanceBlock } from '@/src/types/balance'

export interface DatabaseBackup {
  version: number
  createdAt: number
  checksum: string
  databases: {
    balanceHistory?: {
      blocks: StoredBalanceBlock[]
      blockCount: number
    }
    offlineStorage?: {
      inspectionDrafts: SerializedDraft[]
      submissionQueue: SerializedQueueItem[]
      cachedData: SerializedCacheEntry[]
    }
  }
}

export interface SerializedDraft {
  draftId: string
  data: string
  createdAt: number
  updatedAt: number
  version: number
}

export interface SerializedQueueItem {
  queueId?: number
  payload: string
  createdAt: number
  retryCount: number
}

export interface SerializedCacheEntry {
  cacheKey: string
  data: string
  createdAt: number
  expiresAt: number
  version: number
}

export type BackupStatus = 'idle' | 'running' | 'success' | 'failure'

export type VerifyStatus = 'idle' | 'running' | 'passed' | 'failed'

export type RestoreStatus = 'idle' | 'running' | 'success' | 'failure'

export interface BackupState {
  lastBackupTime: number | null
  lastVerifyTime: number | null
  lastRestoreTime: number | null
  backupStatus: BackupStatus
  verifyStatus: VerifyStatus
  restoreStatus: RestoreStatus
  lastError: string | null
  checksumMismatch: boolean
  scheduleIntervalMs: number
}

export interface BackupReport {
  timestamp: number
  backupSize: number
  blockCount: number
  draftCount: number
  queueCount: number
  cacheCount: number
  checksum: string
  duration: number
  verified: boolean
}
