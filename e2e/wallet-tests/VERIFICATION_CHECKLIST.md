# Wallet E2E Test Suite - Verification Checklist

## ✅ Implementation Complete

Use this checklist to verify the wallet E2E test suite is properly set up and working.

## 📋 File Structure

- [x] `e2e/wallet-tests/walletFlows.spec.ts` - Main test suite (20 tests)
- [x] `e2e/wallet-tests/helpers/mockWallet.ts` - Mock wallet implementation
- [x] `e2e/wallet-tests/fixtures/walletAccounts.ts` - Test keypairs (5 accounts)
- [x] `e2e/wallet-tests/fixtures/apiMocks.ts` - Reusable API mocks
- [x] `e2e/wallet-tests/scripts/generateTestAccounts.js` - Account generator
- [x] `e2e/wallet-tests/README.md` - Developer documentation
- [x] `e2e/wallet-tests/TEST_SUMMARY.md` - Test coverage summary
- [x] `e2e/wallet-tests/VERIFICATION_CHECKLIST.md` - This file

## 📦 Dependencies

- [x] `@playwright/test` installed
- [x] `@stellar/stellar-sdk` installed
- [x] Playwright browsers installed (`npx playwright install chromium`)

## ⚙️ Configuration

- [x] `playwright.config.ts` updated with `wallet-ci` project
- [x] `package.json` scripts updated:
  - [x] `test:e2e:wallet`
  - [x] `test:e2e:wallet:headed`
  - [x] `test:e2e:wallet:debug`
  - [x] `test:e2e:ci`
- [x] `.github/workflows/test.yml` includes E2E test job

## 🧪 Test Verification

### Step 1: List Tests

```bash
npx playwright test --project=wallet-ci --list
```

**Expected output:** `Total: 20 tests in 1 file`

- [ ] Command runs successfully
- [ ] Shows 20 tests
- [ ] No errors in output

### Step 2: Run Tests (Dry Run)

```bash
# This will start the dev server and run tests
# Press Ctrl+C if you want to stop early
npm run test:e2e:wallet
```

**Expected:**
- [ ] Dev server starts on port 3000
- [ ] Tests begin executing
- [ ] Mock wallet is injected
- [ ] API mocks work correctly

### Step 3: Verify Mock Wallet

Run a single test to verify mock wallet works:

```bash
npx playwright test -g "should connect wallet" --headed
```

**Expected:**
- [ ] Browser opens
- [ ] Page loads
- [ ] Test passes (wallet connects)
- [ ] No console errors

### Step 4: Verify Test Accounts

Check that test accounts are valid Stellar keys:

```bash
node -e "console.log(require('./e2e/wallet-tests/fixtures/walletAccounts.ts').TEST_ACCOUNTS)"
```

**Expected:**
- [ ] 5 accounts listed
- [ ] Each has publicKey starting with 'G'
- [ ] Each has secret starting with 'S'
- [ ] Each has displayName

### Step 5: CI Configuration

Check CI workflow:

```bash
# View the workflow file
cat .github/workflows/test.yml
```

**Expected:**
- [ ] `e2e-wallet-tests` job exists
- [ ] Runs `npx playwright test --project=wallet-ci`
- [ ] Uploads test results on failure

## 🎯 Test Coverage Verification

Run each test suite individually to verify coverage:

### Authentication Flows
```bash
npx playwright test -g "Authentication Flows"
```
- [ ] 3 tests pass

### Transaction Signing
```bash
npx playwright test -g "Transaction Signing"
```
- [ ] 3 tests pass

### Staking Operations
```bash
npx playwright test -g "Staking Operations"
```
- [ ] 4 tests pass

### Node Registration
```bash
npx playwright test -g "Node Registration"
```
- [ ] 1 test passes

### Attestation Submission
```bash
npx playwright test -g "Attestation Submission"
```
- [ ] 1 test passes

### Settings Management
```bash
npx playwright test -g "Settings Management"
```
- [ ] 2 tests pass

### Account Switching
```bash
npx playwright test -g "Account Switching"
```
- [ ] 2 tests pass

### Error Handling
```bash
npx playwright test -g "Error Handling"
```
- [ ] 3 tests pass

### Logout Flow
```bash
npx playwright test -g "Logout Flow"
```
- [ ] 1 test passes

## ⚡ Performance Verification

Run full suite and measure time:

```bash
time npx playwright test --project=wallet-ci
```

**Expected:**
- [ ] Total execution time < 2 minutes
- [ ] No test takes > 30 seconds
- [ ] All 20 tests pass
- [ ] No flaky tests (run 3 times to verify)

## 🐛 Debugging Verification

Test debugging capabilities:

```bash
# Debug mode
npx playwright test -g "should connect wallet" --debug
```

**Expected:**
- [ ] Playwright Inspector opens
- [ ] Can step through test
- [ ] Can inspect page elements
- [ ] Can view console logs

## 📊 Report Generation

Generate and view HTML report:

```bash
npx playwright test --project=wallet-ci
npx playwright show-report
```

**Expected:**
- [ ] HTML report opens in browser
- [ ] Shows all 20 tests
- [ ] Shows pass/fail status
- [ ] Can drill down into individual tests

## 🔒 Security Verification

Verify test accounts are safe:

- [ ] Test accounts are NOT in production code
- [ ] Test accounts are clearly marked as test-only
- [ ] Test account secrets are in test files only (not exposed in logs)
- [ ] Mock wallet doesn't use real cryptographic signing

## 📝 Documentation Verification

Check all documentation exists and is complete:

- [ ] `README.md` - Main project readme mentions E2E tests
- [ ] `e2e/wallet-tests/README.md` - Complete developer guide
- [ ] `e2e/wallet-tests/TEST_SUMMARY.md` - Coverage summary
- [ ] Inline code comments in test files
- [ ] JSDoc comments in helper functions

## 🚀 CI/CD Verification

Push to GitHub and verify CI runs:

1. [ ] Push changes to GitHub
2. [ ] GitHub Actions workflow triggers
3. [ ] `e2e-wallet-tests` job runs
4. [ ] All tests pass in CI
5. [ ] Test artifacts uploaded (if any failures)

## ✨ Final Checks

- [ ] All 20 tests listed correctly
- [ ] All 20 tests pass locally
- [ ] Execution time < 2 minutes
- [ ] No TypeScript errors
- [ ] No linting errors
- [ ] Mock wallet API surface complete
- [ ] Test accounts are valid Stellar keys
- [ ] CI configuration correct
- [ ] Documentation complete
- [ ] README updated

## 🎉 Success Criteria

**All checkboxes above should be checked ✅**

If any item is unchecked, review the corresponding section and fix any issues.

## 🆘 Troubleshooting

### Tests Won't Run

```bash
# Reinstall dependencies
npm ci

# Reinstall Playwright browsers
npx playwright install --with-deps chromium
```

### Tests Timeout

```bash
# Increase timeout in playwright.config.ts
# Or run tests sequentially
npx playwright test --project=wallet-ci --workers=1
```

### Mock Wallet Not Working

Check that `injectMockWallet()` is called BEFORE `page.goto()`:

```typescript
// ✅ Correct
await injectMockWallet(page, account);
await page.goto('/');

// ❌ Wrong
await page.goto('/');
await injectMockWallet(page, account);
```

### API Mocks Not Working

Verify route patterns match:

```typescript
// ✅ Catches all /api/v1/ endpoints
await page.route('**/api/v1/**', handler);

// ❌ Might miss some endpoints
await page.route('/api/v1/*', handler);
```

---

**Status:** Ready for verification  
**Last Updated:** June 19, 2026
