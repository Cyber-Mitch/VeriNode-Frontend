# VeriNode-Frontend

Next.js web application for the VeriNode Decentralized Savings Circle (ROSCA) protocol, offering an interface for circle participation, collateral staking, leniency voting, and quadratic governance.

## 🚀 Key Features
* **Interactive Savings Circles:** Interface to create, join, deposit, and view payout orders for Rotating Savings and Credit Association (ROSCA) groups.
* **Collateral & Governance Hub:** Dedicated screens for locking collateral, nominating safety buddies, and submitting/voting on leniency requests.
* **Quadratic Voting Interface:** Fully-featured portal to propose and cast quadratic votes for large circle rule changes.
* **Wallet-Connected Actions:** Secure integration with Stellar wallets (Freighter, Lobstr, Albedo) for authentication, staking, and transactions.

## 🛠️ Tech Stack
* **Language/Framework:** Next.js (React) / TypeScript
* **Key Dependencies:** `next`, `react`, `tailwindcss`, `@stellar/stellar-sdk`, `zustand`, `@tanstack/react-query`
* **Testing:** Playwright E2E tests with mock wallet infrastructure

## 📦 Getting Started

### Prerequisites
Ensure you have the required toolchains installed:
* Node.js (v18 or higher recommended)
* npm (Node Package Manager)

### Installation & Local Setup
```bash
# Clone the repository (if running manually)
git clone https://github.com/VeriNode-Labs/VeriNode-Frontend

# Install dependencies or build
npm install

# Start development server
npm run dev
```

## 🧪 Testing

### E2E Wallet Tests

Comprehensive automated testing for wallet-connected actions without requiring a real wallet extension.

```bash
# Run all wallet E2E tests
npm run test:e2e:wallet

# Run in headed mode (see browser)
npm run test:e2e:wallet:headed

# Run in debug mode
npm run test:e2e:wallet:debug

# Run all E2E tests
npm run test:e2e
```

**Test Coverage:**
- ✅ Authentication flows (login, logout, persistence)
- ✅ Transaction signing (transactions, messages)
- ✅ Staking operations (stake, unstake, balance queries)
- ✅ Node registration
- ✅ Attestation submission
- ✅ Settings management
- ✅ Account switching
- ✅ Error handling (network, API, timeouts)

**20 tests | < 2 minute execution time | Full Freighter API mock**

For detailed documentation, see [e2e/wallet-tests/README.md](e2e/wallet-tests/README.md)

## 🤝 Contributing
Contributions are highly welcome. Please ensure your commits are cryptographically signed using GPG or SSH keys. For major structural changes, please open an issue first to discuss your proposal.

### Development Workflow

1. **Make changes** to the codebase
2. **Run tests** to ensure nothing broke:
   ```bash
   npm run lint
   npm run test:e2e:wallet
   ```
3. **Commit and push** to your fork
4. **Create a pull request** - CI will automatically run all tests
