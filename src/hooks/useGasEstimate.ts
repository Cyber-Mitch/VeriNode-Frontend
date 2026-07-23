import { useState, useEffect } from 'react';
import { gasCacheService } from '../services/gasCacheService';
import { useGasStore } from '../store/gasSlice';
import { hashOperationParams } from '../utils/operationHasher';

export function useGasEstimate(operation: string, params: unknown) {
  const [gasEstimate, setGasEstimate] = useState<bigint | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const currentBaseFee = useGasStore((state) => state.currentBaseFee);
  const recordHit = useGasStore((state) => state.recordHit);
  const recordMiss = useGasStore((state) => state.recordMiss);
  const updateStats = useGasStore((state) => state.updateStats);

  useEffect(() => {
    let isMounted = true;

    async function fetchEstimate() {
      setLoading(true);
      const baseFeeBucket = Math.floor(currentBaseFee / 10) * 10;
      const paramsHash = await hashOperationParams(params);
      
      const cached = gasCacheService.getEstimate(operation, baseFeeBucket, paramsHash);
      
      if (cached) {
        recordHit();
        if (isMounted) setGasEstimate(cached.value);
        if (!cached.stale) {
          if (isMounted) setLoading(false);
          const stats = gasCacheService.getStats();
          updateStats(stats.size, stats.avgTtl);
          return;
        }
      } else {
        recordMiss();
      }

      // Simulate RPC call eth_estimateGas
      const mockGas = BigInt(Math.floor(Math.random() * 100000) + 21000);
      
      if (isMounted) {
          setGasEstimate(mockGas);
          setLoading(false);
      }
      gasCacheService.setEstimate(operation, baseFeeBucket, paramsHash, mockGas, currentBaseFee);
      
      const stats = gasCacheService.getStats();
      updateStats(stats.size, stats.avgTtl);
    }

    fetchEstimate();
    return () => { isMounted = false; };
  }, [operation, params, currentBaseFee, recordHit, recordMiss, updateStats]);

  return { gasEstimate, loading };
}
