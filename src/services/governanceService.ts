/**
 * Governance workflow configuration service
 * 
 * Loads and manages governance configuration including N-of-M approval thresholds
 * and approver lists.
 */

import type { GovernanceConfig } from '@/types/withdrawalChange';

// Default governance configuration
const DEFAULT_CONFIG: GovernanceConfig = {
  threshold: 2,
  totalApprovers: 3,
  approvers: [],
  expiryDuration: 7 * 24 * 60 * 60 * 1000, // 7 days
};

/**
 * In-memory config cache
 */
let configCache: GovernanceConfig | null = null;

/**
 * Loads governance configuration from API or local config
 */
export async function loadGovernanceConfig(): Promise<GovernanceConfig> {
  // Return cached config if available
  if (configCache) {
    return configCache;
  }

  try {
    // Try to load from API endpoint
    const response = await fetch('/api/governance/config');
    if (response.ok) {
      const config = await response.json();
      configCache = validateAndNormalizeConfig(config);
      return configCache;
    }
  } catch (error) {
    console.warn('Failed to load governance config from API:', error);
  }

  // Try to load from local storage
  try {
    const stored = localStorage.getItem('governance:config');
    if (stored) {
      const config = JSON.parse(stored);
      configCache = validateAndNormalizeConfig(config);
      return configCache;
    }
  } catch (error) {
    console.warn('Failed to load governance config from localStorage:', error);
  }

  // Return default config
  console.info('Using default governance configuration');
  configCache = DEFAULT_CONFIG;
  return configCache;
}

/**
 * Saves governance configuration to local storage and optionally to API
 */
export async function saveGovernanceConfig(config: GovernanceConfig): Promise<void> {
  const validated = validateAndNormalizeConfig(config);

  // Save to localStorage
  try {
    localStorage.setItem('governance:config', JSON.stringify(validated));
  } catch (error) {
    console.error('Failed to save governance config to localStorage:', error);
  }

  // Try to save to API
  try {
    const response = await fetch('/api/governance/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validated),
    });
    
    if (!response.ok) {
      console.warn('Failed to save governance config to API');
    }
  } catch (error) {
    console.warn('Failed to save governance config to API:', error);
  }

  // Update cache
  configCache = validated;
}

/**
 * Validates and normalizes governance configuration
 */
function validateAndNormalizeConfig(config: Partial<GovernanceConfig>): GovernanceConfig {
  const threshold = Math.max(1, Math.floor(config.threshold ?? DEFAULT_CONFIG.threshold));
  const approvers = Array.isArray(config.approvers) ? config.approvers : DEFAULT_CONFIG.approvers;
  const totalApprovers = Math.max(threshold, approvers.length);
  const expiryDuration = config.expiryDuration ?? DEFAULT_CONFIG.expiryDuration;

  // Validate threshold is achievable
  if (threshold > totalApprovers) {
    throw new Error(`Threshold (${threshold}) cannot exceed total approvers (${totalApprovers})`);
  }

  // Validate approver addresses
  const validApprovers = approvers.filter(addr => 
    typeof addr === 'string' && /^0x[0-9a-fA-F]{40}$/.test(addr)
  );

  if (validApprovers.length !== approvers.length) {
    console.warn(`Filtered out ${approvers.length - validApprovers.length} invalid approver addresses`);
  }

  return {
    threshold,
    totalApprovers,
    approvers: validApprovers,
    expiryDuration,
  };
}

/**
 * Checks if an address is an eligible approver
 */
export async function isApprover(address: string): Promise<boolean> {
  const config = await loadGovernanceConfig();
  return config.approvers.some(
    approver => approver.toLowerCase() === address.toLowerCase()
  );
}

/**
 * Gets remaining approvers who haven't signed a request
 */
export function getRemainingApprovers(
  config: GovernanceConfig,
  signedApprovers: string[]
): string[] {
  const signedSet = new Set(
    signedApprovers.map(addr => addr.toLowerCase())
  );
  
  return config.approvers.filter(
    approver => !signedSet.has(approver.toLowerCase())
  );
}

/**
 * Checks if approval threshold is met
 */
export function isThresholdMet(
  config: GovernanceConfig,
  signatureCount: number
): boolean {
  return signatureCount >= config.threshold;
}

/**
 * Validates that all signatures are from eligible approvers
 */
export function validateApprovers(
  config: GovernanceConfig,
  approverAddresses: string[]
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const approverSet = new Set(
    config.approvers.map(addr => addr.toLowerCase())
  );

  for (const address of approverAddresses) {
    if (!approverSet.has(address.toLowerCase())) {
      errors.push(`Address ${address} is not an eligible approver`);
    }
  }

  // Check for duplicates
  const seen = new Set<string>();
  for (const address of approverAddresses) {
    const normalized = address.toLowerCase();
    if (seen.has(normalized)) {
      errors.push(`Duplicate signature from ${address}`);
    }
    seen.add(normalized);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Adds a new approver to the configuration
 */
export async function addApprover(address: string): Promise<void> {
  const config = await loadGovernanceConfig();
  
  if (config.approvers.some(a => a.toLowerCase() === address.toLowerCase())) {
    throw new Error('Approver already exists');
  }

  const updated: GovernanceConfig = {
    ...config,
    approvers: [...config.approvers, address],
    totalApprovers: config.totalApprovers + 1,
  };

  await saveGovernanceConfig(updated);
}

/**
 * Removes an approver from the configuration
 */
export async function removeApprover(address: string): Promise<void> {
  const config = await loadGovernanceConfig();
  
  const updated: GovernanceConfig = {
    ...config,
    approvers: config.approvers.filter(
      a => a.toLowerCase() !== address.toLowerCase()
    ),
    totalApprovers: config.totalApprovers - 1,
  };

  // Ensure threshold is still achievable
  if (updated.threshold > updated.totalApprovers) {
    updated.threshold = updated.totalApprovers;
  }

  await saveGovernanceConfig(updated);
}

/**
 * Updates the approval threshold
 */
export async function updateThreshold(newThreshold: number): Promise<void> {
  const config = await loadGovernanceConfig();
  
  if (newThreshold < 1) {
    throw new Error('Threshold must be at least 1');
  }

  if (newThreshold > config.totalApprovers) {
    throw new Error(`Threshold (${newThreshold}) cannot exceed total approvers (${config.totalApprovers})`);
  }

  const updated: GovernanceConfig = {
    ...config,
    threshold: newThreshold,
  };

  await saveGovernanceConfig(updated);
}

/**
 * Resets the configuration cache (useful for testing)
 */
export function resetConfigCache(): void {
  configCache = null;
}
