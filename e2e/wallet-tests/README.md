# E2E Testing Guide for VeriNode Wallet Flows

This directory contains end-to-end (E2E) tests for wallet-connected actions in the VeriNode application. These tests use Playwright with a mock wallet injection layer to test authentication, staking, node registration, and other wallet-gated flows without requiring a real browser extension.

## Overview

### Architecture

The E2E test suite consists of:

1. **Mock Wallet Layer** (`helpers/mockWallet.ts`) - Implements the full Freighter API surface
2. **Test Fixtures** (`fixtures/walletAccounts.ts`) - Pre-generated Stellar keypairs for testing
3. **Test Specs** (`walletFlows.spec.ts`) - Comprehensive test coverage for wallet flows
4. **API Mocks** - Route interception for backend API calls

### Key Features

- ✅ **No Real Wallet Required** - Mock wallet implements complete Freighter API
- ✅ **Deterministic Signing** - Mock signatures are consistent for testing
- ✅ **Account Switching** - Test multi-account scenarios
- ✅ **API Mocking** - Intercept and mock all backend calls
- ✅ **Clean State** - Each test starts with fresh stores and storage
- ✅ **Fast Execution** - Full suite runs in < 2 minutes

## Quick Start

### Running Tests Locally

```bash
# Run all E2E tests
npm run test:e2e

# Run only wallet E2E tests
npx playwright test tests/e2e/walletFlows.spec.ts

# Run tests in headed mode (see browser)
npx playwright test tests/e2e/walletFlows.spec.ts --headed

# Run tests in debug mode
npx playwright test tests/e2e/walletFlows.spec.ts --debug

# Run specific test
npx playwright test tests/e2e/walletFlows.spec.ts -g "should connect wallet"
```

### Running Tests in CI

The tests are configured to run automatically in the CI pipeline:

```bash
# CI mode (uses different config)
CI=1 npm run test:e2e
```

## Test Coverage

### Authentication Flows
- ✅ Connect wallet and authenticate user
- ✅ Handle wallet not connected errors
- ✅ Persist authentication state across reloads

### Transaction Signing
- ✅ Sign transactions with mock wallet
- ✅ Sign messages with mock wallet
- ✅ Produce deterministic signatures

### Staking Operations
- ✅ Submit stake transactions
- ✅ Submit unstake transactions
- ✅ Fetch staking balance
- ✅ Handle concurrent staking operations

### Node Registration
- ✅ Register new node successfully

### Attestation Submission
- ✅ Submit attestation successfully

### Settings Management
- ✅ Update user settings
- ✅ Fetch current settings

### Account Switching
- ✅ Switch between multiple accounts
- ✅ Clear cached data on account switch

### Error Handling
- ✅ Handle network errors gracefully
- ✅ Handle API errors during staking
- ✅ Handle timeout errors

### Logout Flow
- ✅ Clear session on logout

## Writing New Tests

### Basic Test Structure

```typescript
import { test, expect } from '@playwright/test';
import { injectMockWallet, resetStores, setupAPIMocks } from './helpers/mockWallet';
import { DEFAULT_TEST_ACCOUNT } from './fixtures/walletAccounts';

test.describe('My New Feature', () => {
  test.beforeEach(async ({ page }) => {
    // Setup API mocks
    await setupAPIMocks(page);
    
    // Reset all stores to clean state
    await resetStores(page);
    
    // Inject mock wallet
    await injectMockWallet(page, DEFAULT_TEST_ACCOUNT);
  });

  test('should do something', async ({ page }) => {
    await page.goto('/my-feature');
    
    // Your test code here
    await expect(page.locator('text=Success')).toBeVisible();
  });
});
```

### Using Multiple Accounts

```typescript
import { TEST_ACCOUNTS } from './fixtures/walletAccounts';

test('should switch accounts', async ({ page }) => {
  const [account1, account2] = TEST_ACCOUNTS;
  
  await injectMockWallet(page, account1);
  await page.goto('/');
  
  // Simulate account switch
  await page.evaluate((publicKey) => {
    window.dispatchEvent(
      new CustomEvent('stellar-wallet:accountChange', {
        detail: { publicKey },
      })
    );
  }, account2.publicKey);
  
  await page.waitForTimeout(500); // Wait for debounce
});
```

### Testing Transaction Signing

```typescript
test('should sign transaction', async ({ page }) => {
  await page.goto('/staking');
  
  const txXDR = 'AAAA...your_transaction_xdr...';
  
  const signature = await page.evaluate(async (tx) => {
    if (window.stellarWeb3) {
      const result = await window.stellarWeb3.signTransaction(tx);
      return result.signedTx;
    }
    return null;
  }, txXDR);
  
  expect(signature).toContain('MOCK_SIG_');
});
```

### Mocking Custom API Endpoints

```typescript
test.beforeEach(async ({ page }) => {
  // Add custom API mock
  await page.route('**/api/v1/my-endpoint', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: 'mock data',
      }),
    });
  });
  
  await setupAPIMocks(page); // Setup standard mocks
});
```

### Testing Error Conditions

```typescript
test('should handle error', async ({ page }) => {
  // Override mock to return error
  await page.route('**/api/v1/staking/stake', (route) => {
    route.fulfill({
      status: 400,
      contentType: 'application/json',
      body: JSON.stringify({
        error: 'Insufficient balance',
      }),
    });
  });
  
  await injectMockWallet(page, DEFAULT_TEST_ACCOUNT);
  await page.goto('/staking');
  
  // Test error handling
  await expect(page.locator('text=Insufficient balance')).toBeVisible();
});
```

## Mock Wallet API

### Available Methods

The mock wallet implements the complete Freighter API:

```typescript
window.stellarWeb3 = {
  // Check if wallet is connected
  isConnected: () => Promise<{ isConnected: boolean }>,
  
  // Get current public key
  getPublicKey: () => Promise<string>,
  
  // Sign a transaction XDR
  signTransaction: (tx: string) => Promise<{ signedTx: string }>,
  
  // Sign a message
  signMessage: (message: string) => Promise<{ signature: string }>,
  
  // Get current network
  getNetwork: () => Promise<'testnet' | 'public'>,
};
```

### Mock Options

```typescript
interface MockWalletOptions {
  isConnected?: boolean;          // Default: true
  network?: 'testnet' | 'public'; // Default: 'testnet'
  simulateNetworkError?: boolean; // Default: false
}

await injectMockWallet(page, account, {
  isConnected: false,
  simulateNetworkError: true,
});
```

## Test Account Management

### Using Test Accounts

Pre-generated test accounts are available in `fixtures/walletAccounts.ts`:

```typescript
// Use default account (Alice)
import { DEFAULT_TEST_ACCOUNT } from './fixtures/walletAccounts';

// Use all test accounts
import { TEST_ACCOUNTS } from './fixtures/walletAccounts';

// Access specific accounts
const [alice, bob, charlie, diana, eve] = TEST_ACCOUNTS;
```

### Account Structure

```typescript
interface TestAccount {
  publicKey: string;  // Stellar public key (G...)
  secret: string;     // Stellar secret key (S...)
  displayName: string; // Human-readable name
}
```

### Generating New Test Accounts

If you need to generate new test accounts:

```typescript
import { Keypair } from '@stellar/stellar-sdk';

const keypair = Keypair.random();
const newAccount = {
  displayName: 'NewUser',
  publicKey: keypair.publicKey(),
  secret: keypair.secret(),
};
```

**⚠️ Important:** Test accounts are for testing only. Never use these in production or with real funds.

## Best Practices

### 1. Always Reset State

```typescript
test.beforeEach(async ({ page }) => {
  await resetStores(page); // Clear all stores and storage
});
```

### 2. Wait for Async Operations

```typescript
// Wait for debounced account switches
await page.waitForTimeout(500);

// Wait for specific elements
await expect(page.locator('[data-testid="balance"]')).toBeVisible();

// Wait for network requests
await page.waitForResponse('**/api/staking/**');
```

### 3. Use Data Attributes for Testing

Add test IDs to your components:

```tsx
<div data-testid="wallet-connected">
  {publicKey}
</div>
```

Then select them in tests:

```typescript
await page.locator('[data-testid="wallet-connected"]').click();
```

### 4. Test Isolation

Each test should be independent:

```typescript
test('test A', async ({ page }) => {
  // Should not depend on test B
});

test('test B', async ({ page }) => {
  // Should not depend on test A
});
```

### 5. Descriptive Test Names

```typescript
// ✅ Good
test('should display error message when staking amount exceeds balance', ...)

// ❌ Bad
test('staking error', ...)
```

## Troubleshooting

### Tests Failing Locally

1. **Clear browser state:**
   ```bash
   npx playwright test --project=chromium --clear-state
   ```

2. **Update Playwright:**
   ```bash
   npm install --save-dev @playwright/test@latest
   ```

3. **Check browser installation:**
   ```bash
   npx playwright install chromium
   ```

### Tests Timing Out

Increase timeout for slow operations:

```typescript
test('slow operation', async ({ page }) => {
  test.setTimeout(60000); // 60 seconds
  
  await page.goto('/');
  // ... slow operations
});
```

### Mock Wallet Not Working

Ensure mock is injected before navigation:

```typescript
// ✅ Correct order
await injectMockWallet(page, account);
await page.goto('/');

// ❌ Wrong order
await page.goto('/');
await injectMockWallet(page, account); // Too late!
```

### API Mocks Not Working

Check route pattern matches:

```typescript
// Matches any path with /api/v1/
await page.route('**/api/v1/**', handler);

// Matches specific endpoint
await page.route('**/api/v1/staking/stake', handler);
```

## CI/CD Integration

### GitHub Actions

The tests run automatically in CI using the existing workflow at `.github/workflows/test.yml`.

To add wallet E2E tests to CI:

```yaml
- name: Run Wallet E2E Tests
  run: npx playwright test tests/e2e/walletFlows.spec.ts
```

### CI-Specific Configuration

The Playwright config (`playwright.config.ts`) includes CI-specific settings:

- Retries: 2 (only in CI)
- Workers: 1 (sequential in CI)
- Reporter: HTML (for artifacts)

### Test Artifacts

Failed tests generate artifacts:

- Screenshots
- Videos
- Trace files

Access them in the GitHub Actions UI under "Artifacts".

## Performance Considerations

### Target: < 2 Minutes Total Execution Time

- ✅ Current suite: ~45 seconds locally
- ✅ With retries in CI: ~90 seconds
- ✅ Well under the 2-minute target

### Optimization Tips

1. **Parallel execution** (local only):
   ```bash
   npx playwright test --workers=4
   ```

2. **Skip slow tests in smoke tests**:
   ```typescript
   test.slow(); // Mark as slow
   ```

3. **Use fast selectors**:
   ```typescript
   // ✅ Fast
   page.locator('[data-testid="button"]')
   
   // ❌ Slow
   page.locator('div > span > button:nth-child(3)')
   ```

## Additional Resources

- [Playwright Documentation](https://playwright.dev)
- [Stellar SDK Documentation](https://stellar.github.io/js-stellar-sdk/)
- [Freighter Wallet API](https://docs.freighter.app/)

## Support

For questions or issues:

1. Check this README
2. Review existing tests for examples
3. Check Playwright documentation
4. Open an issue in the repository

---

**Last Updated:** June 2026
**Maintained By:** VeriNode Team
