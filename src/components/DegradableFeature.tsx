'use client';

import type { ReactNode } from 'react';
import { useFeatureFlag } from '@/src/components/FeatureFlagProvider';
import { useIsFeatureShed } from '@/src/components/CapacitySheddingProvider';
import type { FeatureFlag } from '@/src/lib/feature-flags';

export interface DegradableFeatureProps {
  feature: FeatureFlag;
  children: ReactNode;
  fallback?: ReactNode;
}

function DefaultFallback({ feature }: { feature: string }) {
  return (
    <div className="rounded-lg border border-dashed border-zinc-300 bg-zinc-50 p-6 text-center dark:border-zinc-600 dark:bg-zinc-800/50">
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        <span className="font-medium capitalize">{feature.replace('-', ' ')}</span>
        {' '}is currently unavailable
      </p>
      <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">
        This feature has been disabled or temporarily shed due to system conditions.
      </p>
    </div>
  );
}

export function DegradableFeature({ feature, children, fallback }: DegradableFeatureProps) {
  const isEnabled = useFeatureFlag(feature);
  const isShed = useIsFeatureShed(feature);

  if (!isEnabled || isShed) {
    return fallback ?? <DefaultFallback feature={feature} />;
  }

  return <>{children}</>;
}
