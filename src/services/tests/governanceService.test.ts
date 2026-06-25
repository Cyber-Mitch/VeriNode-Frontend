/**
 * Unit tests for governance service
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  loadGovernanceConfig,
  saveGovernanceConfig,
  isApprover,
  getRemainingApprovers,
  isThresholdMet,
  validateApprovers,
  addApprover,
  removeApprover,
  updateThreshold,
  resetConfigCache,
} from '../governanceService';
import type { GovernanceConfig } from '@/types/withdrawalChange';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    clear: () => {
      store = {};
    },
    removeItem: (key: string) => {
      delete store[key];
    },
  };
})();

global.localStorage = localStorageMock as Storage;

describe('governanceService', () => {
  // Clean up before and after each test
  beforeEach(() => {
    resetConfigCache();
    localStorageMock.clear();
  });

  afterEach(() => {
    resetConfigCache();
    localStorageMock.clear();
  });

  describe('loadGovernanceConfig', () => {
    it('returns default config when no config exists', async () => {
      const config = await loadGovernanceConfig();
      
      expect(config.threshold).toBeGreaterThan(0);
      expect(config.totalApprovers).toBeGreaterThanOrEqual(config.threshold);
      expect(Array.isArray(config.approvers)).toBe(true);
      expect(config.expiryDuration).toBeGreaterThan(0);
    });

    it('loads config from localStorage', async () => {
      const testConfig: GovernanceConfig = {
        threshold: 3,
        totalApprovers: 5,
        approvers: [
          '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1',
          '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb2',
          '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb3',
          '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb4',
          '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb5',
        ],
        expiryDuration: 7 * 24 * 60 * 60 * 1000,
      };

      localStorageMock.setItem('governance:config', JSON.stringify(testConfig));

      resetConfigCache();
      const config = await loadGovernanceConfig();
      
      expect(config.threshold).toBe(3);
      expect(config.totalApprovers).toBe(5);
      expect(config.approvers).toHaveLength(5);
    });

    it('caches config', async () => {
      const config1 = await loadGovernanceConfig();
      const config2 = await loadGovernanceConfig();
      
      expect(config1).toBe(config2); // Same reference
    });
  });

  describe('saveGovernanceConfig', () => {
    it('saves valid config', async () => {
      const config: GovernanceConfig = {
        threshold: 2,
        totalApprovers: 3,
        approvers: [
          '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1',
          '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb2',
          '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb3',
        ],
        expiryDuration: 7 * 24 * 60 * 60 * 1000,
      };

      await saveGovernanceConfig(config);
      
      resetConfigCache();
      const loaded = await loadGovernanceConfig();
      
      expect(loaded.threshold).toBe(2);
      expect(loaded.totalApprovers).toBe(3);
      expect(loaded.approvers).toHaveLength(3);
    });

    it('adjusts totalApprovers when threshold exceeds it', async () => {
      const config: GovernanceConfig = {
        threshold: 3,
        totalApprovers: 2,
        approvers: [
          '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1',
          '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb2',
        ],
        expiryDuration: 7 * 24 * 60 * 60 * 1000,
      };

      await saveGovernanceConfig(config);
      resetConfigCache();
      
      const loaded = await loadGovernanceConfig();
      
      // totalApprovers should be adjusted to at least threshold
      expect(loaded.totalApprovers).toBeGreaterThanOrEqual(loaded.threshold);
    });

    it('filters invalid approver addresses', async () => {
      const config: GovernanceConfig = {
        threshold: 2,
        totalApprovers: 3,
        approvers: [
          '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1',
          'invalid',
          '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb3',
        ],
        expiryDuration: 7 * 24 * 60 * 60 * 1000,
      };

      await saveGovernanceConfig(config);
      
      resetConfigCache();
      const loaded = await loadGovernanceConfig();
      
      expect(loaded.approvers).toHaveLength(2); // Invalid address filtered
    });
  });

  describe('isApprover', () => {
    it('identifies valid approvers', async () => {
      const config: GovernanceConfig = {
        threshold: 2,
        totalApprovers: 3,
        approvers: [
          '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1',
          '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb2',
        ],
        expiryDuration: 7 * 24 * 60 * 60 * 1000,
      };

      await saveGovernanceConfig(config);
      resetConfigCache();

      expect(await isApprover('0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1')).toBe(true);
      expect(await isApprover('0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb3')).toBe(false);
    });

    it('is case-insensitive', async () => {
      const config: GovernanceConfig = {
        threshold: 1,
        totalApprovers: 1,
        approvers: ['0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1'],
        expiryDuration: 7 * 24 * 60 * 60 * 1000,
      };

      await saveGovernanceConfig(config);
      resetConfigCache();

      expect(await isApprover('0x742D35CC6634C0532925A3B844BC9E7595F0BEB1')).toBe(true);
    });
  });

  describe('getRemainingApprovers', () => {
    it('returns approvers who haven\'t signed', () => {
      const config: GovernanceConfig = {
        threshold: 2,
        totalApprovers: 3,
        approvers: [
          '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1',
          '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb2',
          '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb3',
        ],
        expiryDuration: 7 * 24 * 60 * 60 * 1000,
      };

      const signed = ['0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1'];
      const remaining = getRemainingApprovers(config, signed);

      expect(remaining).toHaveLength(2);
      expect(remaining).toContain('0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb2');
      expect(remaining).toContain('0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb3');
    });

    it('is case-insensitive', () => {
      const config: GovernanceConfig = {
        threshold: 2,
        totalApprovers: 2,
        approvers: [
          '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1',
          '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb2',
        ],
        expiryDuration: 7 * 24 * 60 * 60 * 1000,
      };

      const signed = ['0x742D35CC6634C0532925A3B844BC9E7595F0BEB1'];
      const remaining = getRemainingApprovers(config, signed);

      expect(remaining).toHaveLength(1);
    });
  });

  describe('isThresholdMet', () => {
    it('correctly determines threshold', () => {
      const config: GovernanceConfig = {
        threshold: 3,
        totalApprovers: 5,
        approvers: [],
        expiryDuration: 7 * 24 * 60 * 60 * 1000,
      };

      expect(isThresholdMet(config, 2)).toBe(false);
      expect(isThresholdMet(config, 3)).toBe(true);
      expect(isThresholdMet(config, 4)).toBe(true);
    });
  });

  describe('validateApprovers', () => {
    const config: GovernanceConfig = {
      threshold: 2,
      totalApprovers: 3,
      approvers: [
        '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1',
        '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb2',
        '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb3',
      ],
      expiryDuration: 7 * 24 * 60 * 60 * 1000,
    };

    it('validates eligible approvers', () => {
      const result = validateApprovers(config, [
        '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1',
        '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb2',
      ]);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('catches ineligible approvers', () => {
      const result = validateApprovers(config, [
        '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1',
        '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb9',
      ]);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('not an eligible'))).toBe(true);
    });

    it('catches duplicate signatures', () => {
      const result = validateApprovers(config, [
        '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1',
        '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1',
      ]);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Duplicate'))).toBe(true);
    });
  });

  describe('addApprover', () => {
    it('adds new approver', async () => {
      const config: GovernanceConfig = {
        threshold: 2,
        totalApprovers: 2,
        approvers: [
          '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1',
          '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb2',
        ],
        expiryDuration: 7 * 24 * 60 * 60 * 1000,
      };

      await saveGovernanceConfig(config);
      resetConfigCache();

      await addApprover('0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb3');
      
      resetConfigCache();
      const updated = await loadGovernanceConfig();
      
      expect(updated.approvers).toHaveLength(3);
      expect(updated.totalApprovers).toBe(3);
    });

    it('prevents duplicate approvers', async () => {
      const config: GovernanceConfig = {
        threshold: 2,
        totalApprovers: 2,
        approvers: [
          '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1',
          '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb2',
        ],
        expiryDuration: 7 * 24 * 60 * 60 * 1000,
      };

      await saveGovernanceConfig(config);
      resetConfigCache();

      await expect(
        addApprover('0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1')
      ).rejects.toThrow('already exists');
    });
  });

  describe('removeApprover', () => {
    it('removes approver', async () => {
      const config: GovernanceConfig = {
        threshold: 2,
        totalApprovers: 3,
        approvers: [
          '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1',
          '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb2',
          '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb3',
        ],
        expiryDuration: 7 * 24 * 60 * 60 * 1000,
      };

      await saveGovernanceConfig(config);
      resetConfigCache();

      await removeApprover('0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb3');
      
      resetConfigCache();
      const updated = await loadGovernanceConfig();
      
      expect(updated.approvers).toHaveLength(2);
      expect(updated.totalApprovers).toBe(2);
    });

    it('adjusts threshold if necessary', async () => {
      const config: GovernanceConfig = {
        threshold: 3,
        totalApprovers: 3,
        approvers: [
          '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1',
          '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb2',
          '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb3',
        ],
        expiryDuration: 7 * 24 * 60 * 60 * 1000,
      };

      await saveGovernanceConfig(config);
      resetConfigCache();

      await removeApprover('0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb3');
      
      resetConfigCache();
      const updated = await loadGovernanceConfig();
      
      expect(updated.threshold).toBe(2); // Adjusted down
    });
  });

  describe('updateThreshold', () => {
    it('updates threshold', async () => {
      const config: GovernanceConfig = {
        threshold: 2,
        totalApprovers: 5,
        approvers: [
          '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1',
          '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb2',
          '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb3',
          '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb4',
          '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb5',
        ],
        expiryDuration: 7 * 24 * 60 * 60 * 1000,
      };

      await saveGovernanceConfig(config);
      resetConfigCache();

      await updateThreshold(3);
      
      resetConfigCache();
      const updated = await loadGovernanceConfig();
      
      expect(updated.threshold).toBe(3);
    });

    it('rejects threshold exceeding total approvers', async () => {
      const config: GovernanceConfig = {
        threshold: 2,
        totalApprovers: 3,
        approvers: [
          '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1',
          '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb2',
          '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb3',
        ],
        expiryDuration: 7 * 24 * 60 * 60 * 1000,
      };

      await saveGovernanceConfig(config);
      resetConfigCache();

      await expect(updateThreshold(5)).rejects.toThrow();
    });

    it('rejects threshold less than 1', async () => {
      const config: GovernanceConfig = {
        threshold: 2,
        totalApprovers: 3,
        approvers: [
          '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1',
          '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb2',
          '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb3',
        ],
        expiryDuration: 7 * 24 * 60 * 60 * 1000,
      };

      await saveGovernanceConfig(config);
      resetConfigCache();

      await expect(updateThreshold(0)).rejects.toThrow();
    });
  });
});
