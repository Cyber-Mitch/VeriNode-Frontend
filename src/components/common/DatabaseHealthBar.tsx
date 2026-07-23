'use client'

import { useBackupStore } from '@/src/services/db/backupStore'

export function DatabaseHealthBar() {
  const lastBackupTime = useBackupStore((s) => s.lastBackupTime)
  const lastVerifyTime = useBackupStore((s) => s.lastVerifyTime)
  const backupStatus = useBackupStore((s) => s.backupStatus)
  const verifyStatus = useBackupStore((s) => s.verifyStatus)
  const checksumMismatch = useBackupStore((s) => s.checksumMismatch)
  const lastError = useBackupStore((s) => s.lastError)
  const isScheduled = useBackupStore((s) => s.isScheduled)

  const isRunning = backupStatus === 'running' || verifyStatus === 'running'
  const hasIssue = backupStatus === 'failure' || verifyStatus === 'failed' || checksumMismatch

  return (
    <div className="flex items-center gap-3">
      {isScheduled && (
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
            hasIssue
              ? 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300'
              : isRunning
                ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
                : 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
          }`}
        >
          <span
            className={`inline-block h-1.5 w-1.5 rounded-full ${
              isRunning ? 'animate-pulse bg-blue-500' : hasIssue ? 'bg-red-500' : 'bg-green-500'
            }`}
          />
          DB {hasIssue ? 'Issue' : isRunning ? 'Running' : 'Healthy'}
        </span>
      )}
      {lastBackupTime && (
        <span className="text-xs text-zinc-400">
          Backup: {new Date(lastBackupTime).toLocaleTimeString()}
        </span>
      )}
      {lastVerifyTime && (
        <span className="text-xs text-zinc-400">
          Verify: {new Date(lastVerifyTime).toLocaleTimeString()}
        </span>
      )}
      {lastError && (
        <span className="text-xs text-red-500" title={lastError}>
          Error
        </span>
      )}
    </div>
  )
}
