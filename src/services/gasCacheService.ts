import { gasVolatilityTracker } from '../utils/gasVolatilityTracker';

export interface CacheEntry {
  gasEstimate: bigint;
  baseFeeAtCacheTime: number;
  operationParamsHash: string;
  cachedAt: number;
  expiresAt: number;
}

class GasCacheService {
  private cache = new Map<string, CacheEntry>();
  private readonly MAX_ENTRIES = 500;

  private makeKey(operation: string, baseFeeBucket: number, paramsHash: string): string {
    return `${operation}:${baseFeeBucket}:${paramsHash}`;
  }

  getEstimate(operation: string, baseFeeBucket: number, paramsHash: string): { value: bigint; stale: boolean } | null {
    const key = this.makeKey(operation, baseFeeBucket, paramsHash);
    const entry = this.cache.get(key);
    if (!entry) return null;

    const now = Date.now();
    // stale-while-revalidate if expiresAt within 30s
    if (now > entry.expiresAt) {
      if (now - entry.expiresAt <= 30000) {
        return { value: entry.gasEstimate, stale: true };
      }
      this.cache.delete(key);
      return null;
    }
    return { value: entry.gasEstimate, stale: false };
  }

  setEstimate(operation: string, baseFeeBucket: number, paramsHash: string, value: bigint, baseFee: number): void {
    if (this.cache.size >= this.MAX_ENTRIES) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.cache.delete(firstKey);
    }

    const volatilityMultiplier = gasVolatilityTracker.getVolatilityMultiplier();
    const baseTtl = 120000; // 120s
    const ttl = baseTtl * volatilityMultiplier;
    
    const key = this.makeKey(operation, baseFeeBucket, paramsHash);
    this.cache.set(key, {
      gasEstimate: value,
      baseFeeAtCacheTime: baseFee,
      operationParamsHash: paramsHash,
      cachedAt: Date.now(),
      expiresAt: Date.now() + ttl,
    });
  }

  invalidateOperation(operation: string): void {
    for (const key of this.cache.keys()) {
      if (key.startsWith(`${operation}:`)) {
        this.cache.delete(key);
      }
    }
  }
  
  getStats() {
    let avgTtl = 0;
    if (this.cache.size > 0) {
        let totalTtl = 0;
        for (const entry of this.cache.values()) {
            totalTtl += (entry.expiresAt - entry.cachedAt);
        }
        avgTtl = totalTtl / this.cache.size;
    }
    return {
        size: this.cache.size,
        avgTtl: avgTtl / 1000 // in seconds
    };
  }
}

export const gasCacheService = new GasCacheService();
