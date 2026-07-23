/**
 * Simple script to validate test account keys from walletAccounts.ts
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const fs = require('fs');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const path = require('path');

// Read the walletAccounts.ts file
const accountsFilePath = path.join(__dirname, '../fixtures/walletAccounts.ts');
const fileContent = fs.readFileSync(accountsFilePath, 'utf-8');

// Extract the accounts array using regex
const accountsMatch = fileContent.match(/export const TEST_ACCOUNTS[^=]*=\s*\[([\s\S]*?)\];/);

if (!accountsMatch) {
  console.error('❌ Could not find TEST_ACCOUNTS in walletAccounts.ts');
  process.exit(1);
}

// Parse the accounts
const accountsArrayText = '[' + accountsMatch[1] + ']';
const TEST_ACCOUNTS = eval('(' + accountsArrayText + ')');

// Basic validation
let hasErrors = false;

console.log('Validating test accounts from walletAccounts.ts...\n');

TEST_ACCOUNTS.forEach((account, index) => {
  console.log(`${index + 1}. ${account.displayName}`);
  
  // Check public key format
  if (!account.publicKey.startsWith('G')) {
    console.error(`   ❌ Invalid public key format (should start with G)`);
    hasErrors = true;
  } else if (account.publicKey.length !== 56) {
    console.error(`   ❌ Invalid public key length (should be 56 chars, got ${account.publicKey.length})`);
    hasErrors = true;
  } else {
    console.log(`   ✅ Public key: ${account.publicKey} (${account.publicKey.length} chars)`);
  }
  
  // Check secret key format
  if (!account.secret.startsWith('S')) {
    console.error(`   ❌ Invalid secret key format (should start with S)`);
    hasErrors = true;
  } else if (account.secret.length !== 56) {
    console.error(`   ❌ Invalid secret key length (should be 56 chars, got ${account.secret.length})`);
    hasErrors = true;
  } else {
    console.log(`   ✅ Secret key: ${account.secret} (${account.secret.length} chars)`);
  }
  
  console.log();
});

if (hasErrors) {
  console.error('❌ Validation failed! Some accounts have invalid keys.');
  process.exit(1);
} else {
  console.log('✅ All accounts validated successfully!');
  console.log(`Total: ${TEST_ACCOUNTS.length} accounts`);
}
