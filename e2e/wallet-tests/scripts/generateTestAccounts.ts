/**
 * Script to generate real Stellar test keypairs
 * Run with: npx ts-node e2e/wallet-tests/scripts/generateTestAccounts.ts
 */

import { Keypair } from '@stellar/stellar-sdk';

interface TestAccount {
  displayName: string;
  publicKey: string;
  secret: string;
}

const accountNames = ['Alice', 'Bob', 'Charlie', 'Diana', 'Eve'];

function generateTestAccounts(count: number): TestAccount[] {
  const accounts: TestAccount[] = [];

  for (let i = 0; i < count; i++) {
    const keypair = Keypair.random();
    accounts.push({
      displayName: accountNames[i] || `User${i + 1}`,
      publicKey: keypair.publicKey(),
      secret: keypair.secret(),
    });
  }

  return accounts;
}

function generateTypeScriptFile(accounts: TestAccount[]): string {
  return `/**
 * Pre-generated test account fixtures for wallet E2E tests
 * These are deterministic test keypairs generated using Stellar SDK
 * 
 * ⚠️ WARNING: These are test-only keys - NEVER use in production or with real funds
 * 
 * Generated: ${new Date().toISOString()}
 */

export interface TestAccount {
  publicKey: string;
  secret: string;
  displayName: string;
}

/**
 * Test accounts with pre-computed Stellar keypairs
 * IMPORTANT: These are test-only keys - never use in production
 */
export const TEST_ACCOUNTS: TestAccount[] = ${JSON.stringify(accounts, null, 2)};

/**
 * Default test account (Alice) for single-account tests
 */
export const DEFAULT_TEST_ACCOUNT = TEST_ACCOUNTS[0];
`;
}

// Generate accounts
const accounts = generateTestAccounts(5);

console.log('Generated Test Accounts:');
console.log('=======================\n');

accounts.forEach((account, index) => {
  console.log(`${index + 1}. ${account.displayName}`);
  console.log(`   Public Key: ${account.publicKey}`);
  console.log(`   Secret Key: ${account.secret}`);
  console.log();
});

console.log('\nTypeScript File Content:');
console.log('========================\n');
console.log(generateTypeScriptFile(accounts));

console.log('\n⚠️  IMPORTANT:');
console.log('These keys are for testing only.');
console.log('Never use them with real funds or in production.');
console.log('\nTo update walletAccounts.ts, copy the TypeScript output above.');
