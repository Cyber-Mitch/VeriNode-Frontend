# Wallet E2E Tests - Quick Start Guide

## 🚀 Get Started in 30 Seconds

### Prerequisites

```bash
# Ensure dependencies are installed
npm install

# Install Playwright browsers (if not already installed)
npx playwright install chromium
```

### Run Tests

```bash
# Run all wallet E2E tests
npm run test:e2e:wallet
```

That's it! The tests will run automatically with the mock wallet.

## 📋 Common Commands

```bash
# Run tests in headed mode (see browser)
npm run test:e2e:wallet:headed

# Run tests in debug mode
npm run test:e2e:wallet:debug

# Run specific test
npx playwright test -g "should connect wallet"

# Run specific test suite
npx playwright test -g "Authentication Flows"

# List all tests without running
npx playwright test --project=wallet-ci --list

# Run with verbose output
npx playwright test --project=wallet-ci --reporter=list

# Generate HTML report
npx playwright test --project=wallet-ci
npx playwright show-report
```

## 🎯 What Gets Tested

✅ **Authentication** - Login, logout, session persistence  
✅ **Transactions** - Signing, deterministic signatures  
✅ **Staking** - Stake, unstake, balance queries  
✅ **Registration** - Node registration  
✅ **Attestations** - Submission  
✅ **Settings** - CRUD operations  
✅ **Account Switching** - Multi-account support  
✅ **Error Handling** - Network errors, API errors, timeouts  

**Total: 20 tests | Execution: < 2 minutes**

## 🔧 Quick Troubleshooting

### Tests Won't Start

```bash
# Reinstall dependencies
npm ci
npx playwright install chromium
```

### Need to See What's Happening

```bash
# Run in headed mode
npm run test:e2e:wallet:headed
```

### Want to Step Through a Test

```bash
# Run in debug mode
npm run test:e2e:wallet:debug
```

### Tests Failing

```bash
# Check if dev server starts
npm run dev

# In another terminal, run tests
npm run test:e2e:wallet
```

## 📚 Learn More

- **Full Documentation:** [README.md](./README.md)
- **Test Coverage:** [TEST_SUMMARY.md](./TEST_SUMMARY.md)
- **Verification:** [VERIFICATION_CHECKLIST.md](./VERIFICATION_CHECKLIST.md)

## 💡 Pro Tips

1. **Use headed mode** when writing new tests:
   ```bash
   npm run test:e2e:wallet:headed
   ```

2. **Run specific test** to save time during development:
   ```bash
   npx playwright test -g "your test name"
   ```

3. **Use debug mode** to step through failing tests:
   ```bash
   npm run test:e2e:wallet:debug
   ```

4. **Check the HTML report** for detailed test results:
   ```bash
   npx playwright show-report
   ```

## 🆘 Need Help?

1. Check [README.md](./README.md) for detailed documentation
2. Review [VERIFICATION_CHECKLIST.md](./VERIFICATION_CHECKLIST.md) for setup issues
3. See [TEST_SUMMARY.md](./TEST_SUMMARY.md) for coverage details
4. Open an issue in the repository

---

**Ready to test?** Run `npm run test:e2e:wallet` 🚀
