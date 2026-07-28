import { logger } from '@/src/services/logging';

export type FeatureFlag =
  | 'staking'
  | 'governance'
  | 'quadratic-voting'
  | 'collateral'
  | 'analytics'
  | 'notification'
  | 'explorer';

export type FeatureFlagState = Record<FeatureFlag, boolean>;
export type FeatureFlagOverride = Partial<FeatureFlagState>;

export const DEFAULT_FEATURE_FLAGS: FeatureFlagState = {
  staking: true,
  governance: true,
  'quadratic-voting': true,
  collateral: true,
  analytics: true,
  notification: true,
  explorer: true,
};

const STORAGE_KEY = 'vn_feature_flags';

export function getStoredOverrides(): FeatureFlagOverride {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as FeatureFlagOverride;
  } catch {
    return {};
  }
}

export function persistOverrides(overrides: FeatureFlagOverride): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
  } catch (e) {
    logger.error('feature flag overrides persist failed', { 'event.name': 'feature_flags.persist_failed', 'db.system': 'web_storage', 'db.operation.name': 'setItem', 'db.collection.name': STORAGE_KEY, 'error.type': e instanceof Error ? e.name : typeof e });
  }
}

export function getURLParamOverrides(): FeatureFlagOverride {
  if (typeof window === 'undefined') return {};
  const params = new URLSearchParams(window.location.search);
  const overrides: FeatureFlagOverride = {};
  for (const flag of Object.keys(DEFAULT_FEATURE_FLAGS) as FeatureFlag[]) {
    const key = `feature_${flag}`;
    const val = params.get(key);
    if (val !== null) {
      overrides[flag] = val === 'true';
    }
  }
  return overrides;
}

export function computeFeatureFlags(overrides?: FeatureFlagOverride): FeatureFlagState {
  const stored = getStoredOverrides();
  const urlParams = getURLParamOverrides();
  const result = { ...DEFAULT_FEATURE_FLAGS };
  if (overrides) {
    for (const key of Object.keys(overrides) as FeatureFlag[]) {
      result[key] = overrides[key]!;
    }
  }
  for (const key of Object.keys(stored) as FeatureFlag[]) {
    result[key] = stored[key]!;
  }
  for (const key of Object.keys(urlParams) as FeatureFlag[]) {
    result[key] = urlParams[key]!;
  }
  return result;
}
