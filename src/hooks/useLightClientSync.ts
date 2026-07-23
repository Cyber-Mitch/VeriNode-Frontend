import { useState, useEffect, useRef } from 'react';
import { lightClientService, OptimisticUpdateEvent } from '../services/lightClientService';
import { detectSyncPhase, SyncPhase } from '../utils/syncPhaseDetector';
import { ThroughputCalculator } from '../utils/throughputCalculator';

const MAX_SYNC_DISTANCE = 1048576;
const MAX_RING_BUFFER_SIZE = 1440;

export interface SyncMetrics {
  progress: number;
  phase: SyncPhase;
  throughput: number;
  etaSeconds: number | null;
  syncDistance: number;
  headSlot: number;
  validatedSlot: number;
}

export function useLightClientSync() {
  const [metrics, setMetrics] = useState<SyncMetrics>({
    progress: 0,
    phase: 'Bootstrap',
    throughput: 0,
    etaSeconds: null,
    syncDistance: MAX_SYNC_DISTANCE,
    headSlot: MAX_SYNC_DISTANCE,
    validatedSlot: 0,
  });

  const [historicalData, setHistoricalData] = useState<SyncMetrics[]>([]);
  
  const throughputCalc = useRef(new ThroughputCalculator());
  const lastValidatedSlot = useRef<number | null>(null);
  
  const latestMetricsRef = useRef(metrics);
  
  useEffect(() => {
    latestMetricsRef.current = metrics;
  }, [metrics]);

  useEffect(() => {
    const handleUpdate = (event: OptimisticUpdateEvent) => {
      const { head_slot, latest_validated_slot } = event;
      
      const syncDistance = Math.max(0, head_slot - latest_validated_slot);
      const progress = Math.max(0, Math.min(1, 1 - (syncDistance / MAX_SYNC_DISTANCE)));
      const phase = detectSyncPhase(progress);

      // Calculate throughput
      if (lastValidatedSlot.current !== null && latest_validated_slot > lastValidatedSlot.current) {
        const advanced = latest_validated_slot - lastValidatedSlot.current;
        throughputCalc.current.addSample(advanced);
      }
      lastValidatedSlot.current = latest_validated_slot;

      const throughput = throughputCalc.current.getSlotsPerSecond();
      
      // ETA calculation
      let etaSeconds = null;
      if (phase === 'Historical' && throughput > 0) {
        etaSeconds = syncDistance / throughput;
      }

      const newMetrics: SyncMetrics = {
        progress,
        phase,
        throughput,
        etaSeconds,
        syncDistance,
        headSlot: head_slot,
        validatedSlot: latest_validated_slot,
      };

      setMetrics(newMetrics);
    };

    const unsubscribe = lightClientService.subscribe(handleUpdate);
    return () => unsubscribe();
  }, []);

  // 1-hour rolling ring buffer (1,440 entries at 2.5s intervals)
  useEffect(() => {
    const intervalId = setInterval(() => {
      setHistoricalData(prev => {
        const newBuffer = [...prev, latestMetricsRef.current];
        if (newBuffer.length > MAX_RING_BUFFER_SIZE) {
          return newBuffer.slice(newBuffer.length - MAX_RING_BUFFER_SIZE);
        }
        return newBuffer;
      });
    }, 2500);

    return () => clearInterval(intervalId);
  }, []);

  return { metrics, historicalData };
}
