'use client';

import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import type { CapacityLevel, CapacityMetrics, CapacityThresholds } from '@/src/lib/capacity-shedding';
import {
  getCurrentLevel,
  recordMetrics,
  subscribeToLevelChanges,
  isFeatureShed,
  FEATURE_PRIORITIES,
} from '@/src/lib/capacity-shedding';

interface CapacityContextValue {
  level: CapacityLevel;
  isShed: (feature: string) => boolean;
  metrics: CapacityMetrics | null;
}

const CapacityContext = createContext<CapacityContextValue>({
  level: 'healthy',
  isShed: () => false,
  metrics: null,
});

export function useCapacityShedding(): CapacityContextValue {
  return useContext(CapacityContext);
}

export function useIsFeatureShed(feature: string): boolean {
  return useContext(CapacityContext).isShed(feature);
}

interface CapacitySheddingProviderProps {
  children: ReactNode;
  thresholds?: Partial<CapacityThresholds>;
  intervalMs?: number;
}

export function CapacitySheddingProvider({
  children,
  thresholds,
  intervalMs = 10000,
}: CapacitySheddingProviderProps) {
  const [level, setLevel] = useState<CapacityLevel>(() => getCurrentLevel());
  const [metrics, setMetrics] = useState<CapacityMetrics | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const unsub = subscribeToLevelChanges(setLevel);
    return unsub;
  }, []);

  const collectMetrics = useCallback(() => {
    const mem = (performance as unknown as Record<string, unknown>).memory as
      | { usedJSHeapSize: number; jsHeapSizeLimit: number }
      | undefined;

    const memoryUsage = mem ? mem.usedJSHeapSize / mem.jsHeapSizeLimit : 0;

    const m: CapacityMetrics = {
      responseTime: 0,
      queueSize: 0,
      errorRate: 0,
      memoryUsage,
    };

    const recorded = recordMetrics(m, thresholds);
    setMetrics(m);
    setLevel(recorded);
  }, [thresholds]);

  useEffect(() => {
    collectMetrics();
    intervalRef.current = setInterval(collectMetrics, intervalMs);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [collectMetrics, intervalMs]);

  const isShed = useCallback(
    (feature: string): boolean => {
      return isFeatureShed(feature, FEATURE_PRIORITIES, level);
    },
    [level],
  );

  return (
    <CapacityContext.Provider value={{ level, isShed, metrics }}>
      {children}
    </CapacityContext.Provider>
  );
}
