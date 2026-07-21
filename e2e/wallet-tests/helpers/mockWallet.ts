import { Page } from '@playwright/test';
import type { TestAccount } from '../fixtures/walletAccounts';

/**
 * Mock implementation of the Freighter API for E2E testing
 * This provides a complete wallet interface without requiring a real browser extension
 */

export interface MockWalletOptions {
  /** Whether the wallet should report as connected */
  isConnected?: boolean;
  /** Network to use (testnet, public) */
  network?: 'testnet' | 'public';
  /** Whether to simulate network errors */
  simulateNetworkError?: boolean;
}

/**
 * Simple mock signing function that returns a deterministic signature
 * In a real implementation, this would use the Stellar SDK to properly sign
 * Note: This is inlined in addInitScript, not called directly from this module
 */
// Removed unused mockSign function - signing logic is inlined in page.addInitScript

/**
 * Injects a mock Freighter wallet into the page context
 * Must be called via page.addInitScript before any app code runs
 */
export async function injectMockWallet(
  page: Page,
  account: TestAccount,
  options: MockWalletOptions = {}
): Promise<void> {
  const { isConnected = true, network = 'testnet', simulateNetworkError = false } = options;

  await page.addInitScript(
    ({ account, isConnected, network, simulateNetworkError }) => {
      // Mock Freighter API (stellarWeb3)
      window.stellarWeb3 = {
        isConnected: async () => {
          if (simulateNetworkError) {
            throw new Error('Network connection failed');
          }
          return { isConnected };
        },
        getPublicKey: async () => {
          if (simulateNetworkError) {
            throw new Error('Network connection failed');
          }
          if (!isConnected) {
            throw new Error('Wallet not connected');
          }
          return account.publicKey;
        },
        signTransaction: async (tx: string) => {
          if (simulateNetworkError) {
            throw new Error('Network connection failed');
          }
          if (!isConnected) {
            throw new Error('Wallet not connected');
          }
          // Mock signing - create deterministic signature
          const hash = Array.from(tx + account.secret).reduce(
            (hash, char) => ((hash << 5) - hash) + char.charCodeAt(0),
            0
          );
          const signature = `MOCK_SIG_${Math.abs(hash).toString(16).toUpperCase().padStart(64, '0')}`;
          return { signedTx: signature };
        },
        signMessage: async (message: string) => {
          if (simulateNetworkError) {
            throw new Error('Network connection failed');
          }
          if (!isConnected) {
            throw new Error('Wallet not connected');
          }
          // Mock signing - create deterministic signature
          const hash = Array.from(message + account.secret).reduce(
            (hash, char) => ((hash << 5) - hash) + char.charCodeAt(0),
            0
          );
          const signature = `MOCK_SIG_${Math.abs(hash).toString(16).toUpperCase().padStart(64, '0')}`;
          return { signature };
        },
        getNetwork: async () => {
          if (simulateNetworkError) {
            throw new Error('Network connection failed');
          }
          return network;
        },
      };

      // Also add Lobstr support (webln)
      window.webln = {
        getPublicKey: async () => {
          if (!isConnected) throw new Error('Wallet not connected');
          return account.publicKey;
        },
        signTransaction: async (tx: string) => {
          if (!isConnected) throw new Error('Wallet not connected');
          const hash = Array.from(tx + account.secret).reduce(
            (hash, char) => ((hash << 5) - hash) + char.charCodeAt(0),
            0
          );
          return `MOCK_SIG_${Math.abs(hash).toString(16).toUpperCase().padStart(64, '0')}`;
        },
      };

      // Add Albedo support
      window.albedo = {
        getPublicKey: async () => {
          if (!isConnected) throw new Error('Wallet not connected');
          return account.publicKey;
        },
        signTransaction: async (tx: string) => {
          if (!isConnected) throw new Error('Wallet not connected');
          const hash = Array.from(tx + account.secret).reduce(
            (hash, char) => ((hash << 5) - hash) + char.charCodeAt(0),
            0
          );
          return `MOCK_SIG_${Math.abs(hash).toString(16).toUpperCase().padStart(64, '0')}`;
        },
      };

      // Store mock account info for debugging
      (window as unknown as { __mockWalletAccount: typeof account }).__mockWalletAccount = account;
    },
    { account, isConnected, network, simulateNetworkError }
  );
}

/**
 * Injects support for multiple mock accounts with account switching
 * Useful for testing account switch flows
 */
export async function injectMockWalletWithSwitching(
  page: Page,
  accounts: TestAccount[],
  initialAccountIndex: number = 0
): Promise<void> {
  await page.addInitScript(
    ({ accounts, initialIndex }) => {
      let currentAccountIndex = initialIndex;

      const getCurrentAccount = () => accounts[currentAccountIndex];

      window.stellarWeb3 = {
        isConnected: async () => ({ isConnected: true }),
        getPublicKey: async () => getCurrentAccount().publicKey,
        signTransaction: async (tx: string) => {
          const account = getCurrentAccount();
          const hash = Array.from(tx + account.secret).reduce(
            (hash, char) => ((hash << 5) - hash) + char.charCodeAt(0),
            0
          );
          const signature = `MOCK_SIG_${Math.abs(hash).toString(16).toUpperCase().padStart(64, '0')}`;
          return { signedTx: signature };
        },
        signMessage: async (message: string) => {
          const account = getCurrentAccount();
          const hash = Array.from(message + account.secret).reduce(
            (hash, char) => ((hash << 5) - hash) + char.charCodeAt(0),
            0
          );
          const signature = `MOCK_SIG_${Math.abs(hash).toString(16).toUpperCase().padStart(64, '0')}`;
          return { signature };
        },
        getNetwork: async () => 'testnet',
      };

      // Helper function to switch accounts
      (window as unknown as { __mockSwitchAccount: (index: number) => void }).__mockSwitchAccount = (index: number) => {
        if (index >= 0 && index < accounts.length) {
          currentAccountIndex = index;
          window.dispatchEvent(
            new CustomEvent('stellar-wallet:accountChange', {
              detail: { publicKey: accounts[index].publicKey },
            })
          );
        }
      };

      (window as unknown as { __mockWalletAccounts: typeof accounts }).__mockWalletAccounts = accounts;
    },
    { accounts, initialIndex: initialAccountIndex }
  );
}

/**
 * Helper to reset all Zustand stores in the app
 * Ensures clean state between tests
 */
export async function resetStores(page: Page): Promise<void> {
  await page.evaluate(() => {
    try {
      // Reset auth store
      const authStore = (window as unknown as { useAuthStore?: { getState: () => { logout?: () => void } } }).useAuthStore;
      if (authStore) {
        const state = authStore.getState();
        if (state.logout) state.logout();
      }

      // Reset staking store
      const stakingStore = (window as unknown as { useStakingStore?: { getState: () => { reset?: () => void } } }).useStakingStore;
      if (stakingStore) {
        const state = stakingStore.getState();
        if (state.reset) state.reset();
      }

      // Clear localStorage (may not be available in all contexts)
      if (typeof localStorage !== 'undefined') {
        localStorage.clear();
      }

      // Clear sessionStorage
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.clear();
      }

      // Clear cookies
      if (document.cookie) {
        document.cookie.split(';').forEach((cookie) => {
          const name = cookie.split('=')[0].trim();
          document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
        });
      }
    } catch (error) {
      // Ignore errors when storage is not accessible (e.g., before page load)
      console.warn('Could not reset stores:', error);
    }
  });
}

/**
 * Setup API route mocking for common wallet-gated endpoints
 */
export async function setupAPIMocks(page: Page): Promise<void> {
  // Mock authentication challenge endpoint
  await page.route('**/api/v1/auth/challenge', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        nonce: 'mock_nonce_' + Date.now(),
        serverId: 'mock_server_id',
        expiresAt: Date.now() + 300000, // 5 minutes
      }),
    });
  });

  // Mock authentication verification endpoint
  await page.route('**/api/v1/auth/verify', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        token: 'mock_jwt_token_' + Date.now(),
        expiresAt: Date.now() + 3600000, // 1 hour
      }),
    });
  });

  // Mock session check endpoint
  await page.route('**/api/v1/auth/session', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        valid: true,
        expiresAt: Date.now() + 3600000, // 1 hour
      }),
    });
  });

  // Mock logout endpoint
  await page.route('**/api/v1/auth/logout', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true }),
    });
  });

  // Mock heartbeat endpoint (for session watcher)
  await page.route('**/api/v1/auth/heartbeat', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true }),
    });
  });

  // Mock staking endpoints
  await page.route('**/api/v1/staking/stake', (route) => {
    const request = route.request();
    const postData = request.postDataJSON();
    
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        txHash: 'mock_tx_hash_' + Date.now(),
        amount: postData?.amount || '0',
        status: 'confirmed',
      }),
    });
  });

  await page.route('**/api/v1/staking/unstake', (route) => {
    const request = route.request();
    const postData = request.postDataJSON();
    
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        txHash: 'mock_tx_hash_' + Date.now(),
        amount: postData?.amount || '0',
        status: 'confirmed',
      }),
    });
  });

  // Mock staking balance endpoint
  await page.route('**/api/staking/**', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        staked: '1000.00',
        rewards: '50.25',
        unlocked: '100.00',
      }),
    });
  });

  // Mock node registration endpoint
  await page.route('**/api/v1/nodes/register', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        nodeId: 'mock_node_' + Date.now(),
        status: 'registered',
      }),
    });
  });

  // Mock attestation submission endpoint
  await page.route('**/api/v1/attestations/submit', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        attestationId: 'mock_attestation_' + Date.now(),
        status: 'submitted',
      }),
    });
  });

  // Mock settings update endpoint
  await page.route('**/api/v1/settings', (route) => {
    if (route.request().method() === 'PUT' || route.request().method() === 'PATCH') {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          updated: route.request().postDataJSON(),
        }),
      });
    } else {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          notifications: true,
          theme: 'dark',
        }),
      });
    }
  });
}
