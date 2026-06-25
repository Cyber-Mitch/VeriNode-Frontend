// LRU cache for exit-queue history, capped at 500 entries.
//
// Keyed by epoch. Backed by a Map (insertion-ordered): touching an entry moves
// it to the most-recent end, and inserts past the cap evict the least-recently
// used key. `values()` returns entries sorted by epoch for time-series use.

import type { NetworkQueueSnapshot } from '@/src/types/exitQueue'

export const DEFAULT_MAX_ENTRIES = 500

export class LRUQueueCache {
  private readonly map = new Map<number, NetworkQueueSnapshot>()

  constructor(private readonly maxEntries: number = DEFAULT_MAX_ENTRIES) {}

  get size(): number {
    return this.map.size
  }

  has(epoch: number): boolean {
    return this.map.has(epoch)
  }

  get(epoch: number): NetworkQueueSnapshot | undefined {
    const entry = this.map.get(epoch)
    if (entry === undefined) return undefined
    // Refresh recency.
    this.map.delete(epoch)
    this.map.set(epoch, entry)
    return entry
  }

  set(epoch: number, snapshot: NetworkQueueSnapshot): void {
    if (this.map.has(epoch)) this.map.delete(epoch)
    this.map.set(epoch, snapshot)
    while (this.map.size > this.maxEntries) {
      const oldest = this.map.keys().next().value
      if (oldest === undefined) break
      this.map.delete(oldest)
    }
  }

  /** Snapshots sorted ascending by epoch. */
  values(): NetworkQueueSnapshot[] {
    return [...this.map.values()].sort((a, b) => a.epoch - b.epoch)
  }

  clear(): void {
    this.map.clear()
  }
}
