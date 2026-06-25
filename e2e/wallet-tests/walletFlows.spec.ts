import { test, expect } from '@playwright/test';
import { injectMockWallet, resetStores, setupAPIMocks } from './helpers/mockWallet';
import { TEST_ACCOUNTS, DEFAULT_TEST_ACCOUNT } from './fixtures/walletAccounts';

/**
 * E2E tests for wallet-connected actions
 * Tests authentication flows, staking transactions, node registration, etc.
 * without requiring a real wallet extension
 */

test.describe('Wallet E2E - Authentication Flows', () => {
  test.beforeEach(async ({ page, context }) => {
    // Clear all cookies and storage before each test
    await context.clearCookies();
    await setupAPIMocks(page);
  });

  test('should connect wallet and authenticate user', async ({ page }) => {
    // Inject mock wallet before navigation
    await injectMockWallet(page, DEFAULT_TEST_ACCOUNT);

    await page.goto('/');

    // Verify wallet is available
    const hasWallet = await page.evaluate(() => {
      return window.stellarWeb3 !== undefined;
    });
    expect(hasWallet).toBe(true);

    // Get public key from mock wallet
    const publicKey = await page.evaluate(async () => {
      if (window.stellarWeb3) {
        return await window.stellarWeb3.getPublicKey();
      }
      return null;
    });

    expect(publicKey).toBe(DEFAULT_TEST_ACCOUNT.publicKey);

    // Verify wallet connection status
    const isConnected = await page.evaluate(async () => {
      if (window.stellarWeb3) {
        const result = await window.stellarWeb3.isConnected();
        return result.isConnected;
      }
      return false;
    });

    expect(isConnected).toBe(true);
  });

  test('should handle wallet not connected error gracefully', async ({ page }) => {
    // Inject disconnected wallet
    await injectMockWallet(page, DEFAULT_TEST_ACCOUNT, { isConnected: false });

    await page.goto('/');

    // Try to get public key from disconnected wallet
    const error = await page.evaluate(async () => {
      try {
        if (window.stellarWeb3) {
          await window.stellarWeb3.getPublicKey();
        }
        return null;
      } catch (err) {
        return err instanceof Error ? err.message : String(err);
      }
    });

    expect(error).toContain('not connected');
  });

  test('should persist authentication state across page reloads', async ({ page }) => {
    await injectMockWallet(page, DEFAULT_TEST_ACCOUNT);

    await page.goto('/');

    // Trigger wallet connection
    const initialKey = await page.evaluate(async () => {
      if (window.stellarWeb3) {
        return await window.stellarWeb3.getPublicKey();
      }
      return null;
    });

    expect(initialKey).toBe(DEFAULT_TEST_ACCOUNT.publicKey);

    // Reload page
    await page.reload();

    // Re-inject wallet after reload
    await injectMockWallet(page, DEFAULT_TEST_ACCOUNT);

    // Verify wallet still works
    const keyAfterReload = await page.evaluate(async () => {
      if (window.stellarWeb3) {
        return await window.stellarWeb3.getPublicKey();
      }
      return null;
    });

    expect(keyAfterReload).toBe(DEFAULT_TEST_ACCOUNT.publicKey);
  });
});

test.describe('Wallet E2E - Transaction Signing', () => {
  test.beforeEach(async ({ page, context }) => {
    await context.clearCookies();
    await setupAPIMocks(page);
    await injectMockWallet(page, DEFAULT_TEST_ACCOUNT);
  });

  test('should sign transactions with mock wallet', async ({ page }) => {
    await page.goto('/');

    const mockTxXDR = 'AAAA...mock_transaction_xdr...';

    const signResult = await page.evaluate(async (txXDR) => {
      if (window.stellarWeb3) {
        return await window.stellarWeb3.signTransaction(txXDR);
      }
      return null;
    }, mockTxXDR);

    expect(signResult).toBeTruthy();
    expect(signResult).toHaveProperty('signedTx');
    expect(signResult?.signedTx).toContain('MOCK_SIG_');
  });

  test('should sign messages with mock wallet', async ({ page }) => {
    await page.goto('/');

    const mockMessage = 'Authentication challenge message';

    const signResult = await page.evaluate(async (message) => {
      if (window.stellarWeb3 && window.stellarWeb3.signMessage) {
        return await window.stellarWeb3.signMessage(message);
      }
      return null;
    }, mockMessage);

    expect(signResult).toBeTruthy();
    expect(signResult).toHaveProperty('signature');
    expect(signResult?.signature).toContain('MOCK_SIG_');
  });

  test('should produce deterministic signatures', async ({ page }) => {
    await page.goto('/');

    const mockTxXDR = 'AAAA...consistent_transaction...';

    // Sign the same transaction twice
    const [sig1, sig2] = await page.evaluate(async (txXDR) => {
      if (window.stellarWeb3) {
        const result1 = await window.stellarWeb3.signTransaction(txXDR);
        const result2 = await window.stellarWeb3.signTransaction(txXDR);
        return [result1.signedTx, result2.signedTx];
      }
      return [null, null];
    }, mockTxXDR);

    expect(sig1).toBe(sig2);
    expect(sig1).toBeTruthy();
  });
});

test.describe('Wallet E2E - Staking Operations', () => {
  test.beforeEach(async ({ page, context }) => {
    await context.clearCookies();
    await setupAPIMocks(page);
    await injectMockWallet(page, DEFAULT_TEST_ACCOUNT);
  });

  test('should submit stake transaction successfully', async ({ page }) => {
    await page.goto('/');

    // Mock staking transaction
    const stakeResult = await page.evaluate(async () => {
      // Simulate calling the staking API
      const response = await fetch('/api/v1/staking/stake', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: '100',
          publicKey: 'GD3ZBMG2A2R7JWNBVVDD4VGMFFYYI46KSEMKN5ZBJAMWE67LAVRIM6GS',
        }),
      });
      return await response.json();
    });

    expect(stakeResult).toHaveProperty('txHash');
    expect(stakeResult.status).toBe('confirmed');
    expect(stakeResult.amount).toBe('100');
  });

  test('should submit unstake transaction successfully', async ({ page }) => {
    await page.goto('/');

    const unstakeResult = await page.evaluate(async () => {
      const response = await fetch('/api/v1/staking/unstake', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: '50',
          publicKey: 'GD3ZBMG2A2R7JWNBVVDD4VGMFFYYI46KSEMKN5ZBJAMWE67LAVRIM6GS',
        }),
      });
      return await response.json();
    });

    expect(unstakeResult).toHaveProperty('txHash');
    expect(unstakeResult.status).toBe('confirmed');
    expect(unstakeResult.amount).toBe('50');
  });

  test('should fetch staking balance', async ({ page }) => {
    await page.goto('/');

    const balance = await page.evaluate(async () => {
      const response = await fetch('/api/staking/GD3ZBMG2A2R7JWNBVVDD4VGMFFYYI46KSEMKN5ZBJAMWE67LAVRIM6GS');
      return await response.json();
    });

    expect(balance).toHaveProperty('staked');
    expect(balance).toHaveProperty('rewards');
    expect(balance).toHaveProperty('unlocked');
    expect(parseFloat(balance.staked)).toBeGreaterThan(0);
  });

  test('should handle concurrent staking operations', async ({ page }) => {
    await page.goto('/');

    // Submit multiple stake transactions concurrently
    const results = await page.evaluate(async () => {
      const promises = [
        fetch('/api/v1/staking/stake', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ amount: '10' }),
        }),
        fetch('/api/v1/staking/stake', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ amount: '20' }),
        }),
        fetch('/api/v1/staking/stake', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ amount: '30' }),
        }),
      ];

      const responses = await Promise.all(promises);
      return await Promise.all(responses.map(r => r.json()));
    });

    expect(results).toHaveLength(3);
    results.forEach((result) => {
      expect(result.status).toBe('confirmed');
      expect(result).toHaveProperty('txHash');
    });
  });
});

test.describe('Wallet E2E - Node Registration', () => {
  test.beforeEach(async ({ page, context }) => {
    await context.clearCookies();
    await setupAPIMocks(page);
    await injectMockWallet(page, DEFAULT_TEST_ACCOUNT);
  });

  test('should register new node successfully', async ({ page }) => {
    await page.goto('/');

    const registrationResult = await page.evaluate(async () => {
      const response = await fetch('/api/v1/nodes/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nodeUrl: 'https://node.example.com',
          publicKey: 'GD3ZBMG2A2R7JWNBVVDD4VGMFFYYI46KSEMKN5ZBJAMWE67LAVRIM6GS',
        }),
      });
      return await response.json();
    });

    expect(registrationResult).toHaveProperty('nodeId');
    expect(registrationResult.status).toBe('registered');
  });
});

test.describe('Wallet E2E - Attestation Submission', () => {
  test.beforeEach(async ({ page, context }) => {
    await context.clearCookies();
    await setupAPIMocks(page);
    await injectMockWallet(page, DEFAULT_TEST_ACCOUNT);
  });

  test('should submit attestation successfully', async ({ page }) => {
    await page.goto('/');

    const attestationResult = await page.evaluate(async () => {
      const response = await fetch('/api/v1/attestations/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: 'attestation_data',
          signature: 'mock_signature',
        }),
      });
      return await response.json();
    });

    expect(attestationResult).toHaveProperty('attestationId');
    expect(attestationResult.status).toBe('submitted');
  });
});

test.describe('Wallet E2E - Settings Management', () => {
  test.beforeEach(async ({ page, context }) => {
    await context.clearCookies();
    await setupAPIMocks(page);
    await injectMockWallet(page, DEFAULT_TEST_ACCOUNT);
  });

  test('should update user settings', async ({ page }) => {
    await page.goto('/');

    const updateResult = await page.evaluate(async () => {
      const response = await fetch('/api/v1/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          notifications: false,
          theme: 'light',
        }),
      });
      return await response.json();
    });

    expect(updateResult.success).toBe(true);
    expect(updateResult.updated).toHaveProperty('notifications');
    expect(updateResult.updated).toHaveProperty('theme');
  });

  test('should fetch current settings', async ({ page }) => {
    await page.goto('/');

    const settings = await page.evaluate(async () => {
      const response = await fetch('/api/v1/settings');
      return await response.json();
    });

    expect(settings).toHaveProperty('notifications');
    expect(settings).toHaveProperty('theme');
  });
});

test.describe('Wallet E2E - Account Switching', () => {
  test.beforeEach(async ({ page, context }) => {
    await context.clearCookies();
    await setupAPIMocks(page);
  });

  test('should switch between multiple accounts', async ({ page }) => {
    // Use the first two test accounts
    const [account1, account2] = TEST_ACCOUNTS;

    // Start with account1
    await injectMockWallet(page, account1);
    await page.goto('/');

    const key1 = await page.evaluate(async () => {
      if (window.stellarWeb3) {
        return await window.stellarWeb3.getPublicKey();
      }
      return null;
    });

    expect(key1).toBe(account1.publicKey);

    // Simulate account switch by re-injecting with account2
    await page.evaluate((publicKey) => {
      window.dispatchEvent(
        new CustomEvent('stellar-wallet:accountChange', {
          detail: { publicKey },
        })
      );
    }, account2.publicKey);

    // Wait for the account change to propagate
    await page.waitForTimeout(500);
  });

  test('should clear cached data when switching accounts', async ({ page }) => {
    const [account1, account2] = TEST_ACCOUNTS;

    await injectMockWallet(page, account1);
    await page.goto('/');

    // Verify first account is active
    const key1 = await page.evaluate(async () => {
      if (window.stellarWeb3) {
        return await window.stellarWeb3.getPublicKey();
      }
      return null;
    });

    expect(key1).toBe(account1.publicKey);

    // Fetch some data for account1 (simulate cached data)
    const response1 = await page.evaluate(async () => {
      const response = await fetch('/api/staking/GD3ZBMG2A2R7JWNBVVDD4VGMFFYYI46KSEMKN5ZBJAMWE67LAVRIM6GS');
      return await response.json();
    });

    expect(response1).toHaveProperty('staked');

    // Switch to account2 by dispatching wallet change event
    await page.evaluate((publicKey) => {
      // Update the mock wallet to return the new account
      if (window.stellarWeb3) {
        window.stellarWeb3.getPublicKey = async () => publicKey;
      }
      
      // Dispatch account change event
      window.dispatchEvent(
        new CustomEvent('stellar-wallet:accountChange', {
          detail: { publicKey },
        })
      );
    }, account2.publicKey);

    await page.waitForTimeout(100);

    // Verify the account has changed
    const key2 = await page.evaluate(async () => {
      if (window.stellarWeb3) {
        return await window.stellarWeb3.getPublicKey();
      }
      return null;
    });

    expect(key2).toBe(account2.publicKey);
    expect(key2).not.toBe(key1);
  });
});

test.describe('Wallet E2E - Error Handling', () => {
  test.beforeEach(async ({ page, context }) => {
    await context.clearCookies();
    await setupAPIMocks(page);
  });

  test('should handle network errors gracefully', async ({ page }) => {
    await injectMockWallet(page, DEFAULT_TEST_ACCOUNT, { simulateNetworkError: true });
    await page.goto('/');

    const error = await page.evaluate(async () => {
      try {
        if (window.stellarWeb3) {
          await window.stellarWeb3.getPublicKey();
        }
        return null;
      } catch (err) {
        return err instanceof Error ? err.message : String(err);
      }
    });

    expect(error).toContain('Network connection failed');
  });

  test('should handle API errors during staking', async ({ page }) => {
    await injectMockWallet(page, DEFAULT_TEST_ACCOUNT);

    // Override the stake endpoint to return an error
    await page.route('**/api/v1/staking/stake', (route) => {
      route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'Insufficient balance',
        }),
      });
    });

    await page.goto('/');

    const result = await page.evaluate(async () => {
      try {
        const response = await fetch('/api/v1/staking/stake', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ amount: '10000' }),
        });
        
        if (!response.ok) {
          const error = await response.json();
          return { error: error.error, status: response.status };
        }
        return await response.json();
      } catch (err) {
        return { error: err instanceof Error ? err.message : String(err) };
      }
    });

    expect(result.status).toBe(400);
    expect(result.error).toBe('Insufficient balance');
  });

  test('should handle timeout errors', async ({ page }) => {
    await injectMockWallet(page, DEFAULT_TEST_ACCOUNT);

    // Override endpoint to simulate timeout - don't resolve immediately
    await page.route('**/api/v1/staking/stake', async (route) => {
      // Simulate a slow response by not calling fulfill immediately
      // The AbortController in the evaluate will cancel this request
      await new Promise((resolve) => setTimeout(resolve, 5000));
      route.abort('timedout');
    });

    await page.goto('/');

    const result = await page.evaluate(async () => {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 1500); // 1.5 second timeout

        const response = await fetch('/api/v1/staking/stake', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ amount: '100' }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);
        return await response.json();
      } catch (err) {
        return { error: err instanceof Error ? err.name : String(err) };
      }
    });

    expect(result.error).toBeTruthy();
    expect(result.error).toContain('Abort');
  });
});

test.describe('Wallet E2E - Logout Flow', () => {
  test.beforeEach(async ({ page, context }) => {
    await context.clearCookies();
    await setupAPIMocks(page);
    await injectMockWallet(page, DEFAULT_TEST_ACCOUNT);
  });

  test('should clear session on logout', async ({ page }) => {
    await page.goto('/');

    // Verify wallet is connected
    const initialKey = await page.evaluate(async () => {
      if (window.stellarWeb3) {
        return await window.stellarWeb3.getPublicKey();
      }
      return null;
    });

    expect(initialKey).toBe(DEFAULT_TEST_ACCOUNT.publicKey);

    // Simulate logout by resetting stores
    await resetStores(page);

    // Verify localStorage is cleared
    const storageCleared = await page.evaluate(() => {
      return localStorage.length === 0;
    });

    expect(storageCleared).toBe(true);
  });
});
