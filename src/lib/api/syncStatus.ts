import type { SyncStatus } from '@/src/types/sync'

const SYNC_STATUS_URL = '/api/v1/node/sync-status'

/**
 * Fetches the current node synchronization state from the REST endpoint.
 * GET /api/v1/node/sync-status
 *
 * Returns null and falls back to demo data (handled by the hook) when the
 * endpoint is unreachable, matching the project's existing graceful-fallback
 * pattern used in useValidatorRewards and similar hooks.
 */
export async function fetchSyncStatus(): Promise<SyncStatus> {
  const res = await fetch(SYNC_STATUS_URL, {
    credentials: 'include',
    headers: { Accept: 'application/json' },
  })

  if (!res.ok) {
    throw new Error(`sync-status fetch failed: ${res.status} ${res.statusText}`)
  }

  return res.json() as Promise<SyncStatus>
}
