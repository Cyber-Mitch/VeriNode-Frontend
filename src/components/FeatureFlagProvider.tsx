'use client';

import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import type { FeatureFlag, FeatureFlagState, FeatureFlagOverride } from '@/src/lib/feature-flags';
import { computeFeatureFlags, persistOverrides, getStoredOverrides } from '@/src/lib/feature-flags';

interface FeatureFlagContextValue {
  flags: FeatureFlagState;
  setOverride: (flag: FeatureFlag, value: boolean) => void;
  clearOverrides: () => void;
  isEnabled: (flag: FeatureFlag) => boolean;
}

const FeatureFlagContext = createContext<FeatureFlagContextValue>({
  flags: computeFeatureFlags(),
  setOverride: () => {},
  clearOverrides: () => {},
  isEnabled: () => true,
});

export function useFeatureFlags(): FeatureFlagContextValue {
  return useContext(FeatureFlagContext);
}

export function useFeatureFlag(flag: FeatureFlag): boolean {
  return useContext(FeatureFlagContext).isEnabled(flag);
}

export function FeatureFlagProvider({ children }: { children: ReactNode }) {
  const [overrides, setOverrides] = useState<FeatureFlagOverride>(() => getStoredOverrides());
  const [flags, setFlags] = useState<FeatureFlagState>(() => computeFeatureFlags());
  const overridesRef = useRef(overrides);

  useEffect(() => {
    overridesRef.current = overrides;
  }, [overrides]);

  useEffect(() => {
    const onPopState = () => setFlags(computeFeatureFlags(overridesRef.current));
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const setOverride = useCallback((flag: FeatureFlag, value: boolean) => {
    setOverrides(prev => {
      const next = { ...prev, [flag]: value };
      persistOverrides(next);
      setFlags(computeFeatureFlags(next));
      return next;
    });
  }, []);

  const clearOverrides = useCallback(() => {
    setOverrides({});
    persistOverrides({});
    setFlags(computeFeatureFlags({}));
  }, []);

  const isEnabled = useCallback(
    (flag: FeatureFlag): boolean => flags[flag],
    [flags],
  );

  return (
    <FeatureFlagContext.Provider value={{ flags, setOverride, clearOverrides, isEnabled }}>
      {children}
    </FeatureFlagContext.Provider>
  );
}
