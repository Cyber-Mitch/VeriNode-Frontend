/**
 * BLSToExecutionChange message construction and validation
 * 
 * Constructs SSZ-encoded BLSToExecutionChange messages per Ethereum consensus spec
 * and computes SHA-256 hashes for signing.
 */

import type { BLSToExecutionChangeMessage } from '@/types/withdrawalChange';
import { DOMAIN_BLS_TO_EXECUTION_CHANGE } from '@/types/withdrawalChange';

/**
 * Validates Ethereum address format
 */
export function isValidEthereumAddress(address: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(address);
}

/**
 * Validates BLS public key format (96 bytes hex)
 */
export function isValidBlsPublicKey(pubkey: string): boolean {
  return /^0x[0-9a-fA-F]{96}$/.test(pubkey);
}

/**
 * Validates withdrawal credentials format (0x00 or 0x01 prefix)
 */
export function isValidWithdrawalCredential(credential: string): boolean {
  if (!/^0x(00|01)[0-9a-fA-F]{62}$/.test(credential)) {
    return false;
  }
  return true;
}

/**
 * Validates that the credential is BLS type (0x00 prefix)
 */
export function isBlsWithdrawalCredential(credential: string): boolean {
  return isValidWithdrawalCredential(credential) && credential.startsWith('0x00');
}

/**
 * Validates that the credential is execution layer type (0x01 prefix)
 */
export function isExecutionWithdrawalCredential(credential: string): boolean {
  return isValidWithdrawalCredential(credential) && credential.startsWith('0x01');
}

/**
 * Validates a BLSToExecutionChange message
 */
export function validateBLSToExecutionChangeMessage(
  message: BLSToExecutionChangeMessage
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!Number.isInteger(message.validatorIndex) || message.validatorIndex < 0) {
    errors.push('Validator index must be a non-negative integer');
  }

  if (!isValidBlsPublicKey(message.fromBlsPubkey)) {
    errors.push('Invalid BLS public key format (must be 0x + 96 hex chars)');
  }

  if (!isValidEthereumAddress(message.toExecutionAddress)) {
    errors.push('Invalid execution address format (must be 0x + 40 hex chars)');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Simple SSZ encoding for BLSToExecutionChange
 * 
 * SSZ encoding structure:
 * - validator_index: 8 bytes (uint64, little-endian)
 * - from_bls_pubkey: 48 bytes
 * - to_execution_address: 20 bytes
 * 
 * Total: 76 bytes
 */
export function encodeSSZ(message: BLSToExecutionChangeMessage): Uint8Array {
  const buffer = new Uint8Array(76);
  
  // Encode validator_index as uint64 little-endian (8 bytes)
  const view = new DataView(buffer.buffer);
  view.setBigUint64(0, BigInt(message.validatorIndex), true);
  
  // Encode from_bls_pubkey (48 bytes)
  const blsPubkeyBytes = hexToBytes(message.fromBlsPubkey);
  if (blsPubkeyBytes.length !== 48) {
    throw new Error('BLS public key must be 48 bytes');
  }
  buffer.set(blsPubkeyBytes, 8);
  
  // Encode to_execution_address (20 bytes)
  const executionAddressBytes = hexToBytes(message.toExecutionAddress);
  if (executionAddressBytes.length !== 20) {
    throw new Error('Execution address must be 20 bytes');
  }
  buffer.set(executionAddressBytes, 56);
  
  return buffer;
}

/**
 * Converts hex string to Uint8Array
 */
function hexToBytes(hex: string): Uint8Array {
  const cleaned = hex.startsWith('0x') ? hex.slice(2) : hex;
  const bytes = new Uint8Array(cleaned.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(cleaned.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/**
 * Converts Uint8Array to hex string
 */
function bytesToHex(bytes: Uint8Array): string {
  return '0x' + Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Computes SHA-256 hash of data
 */
export async function sha256(data: Uint8Array): Promise<Uint8Array> {
  if (typeof window !== 'undefined' && window.crypto?.subtle) {
    // Browser environment
    const hashBuffer = await window.crypto.subtle.digest('SHA-256', data as BufferSource);
    return new Uint8Array(hashBuffer);
  } else {
    // Node.js environment (for tests)
    const crypto = await import('crypto');
    const hash = crypto.createHash('sha256').update(data).digest();
    return new Uint8Array(hash);
  }
}

/**
 * Constructs SSZ-encoded BLSToExecutionChange message and computes its hash
 */
export async function constructBLSToExecutionChange(
  message: BLSToExecutionChangeMessage
): Promise<{ sszEncoded: string; messageHash: string }> {
  // Validate message
  const validation = validateBLSToExecutionChangeMessage(message);
  if (!validation.valid) {
    throw new Error(`Invalid message: ${validation.errors.join(', ')}`);
  }

  // Encode to SSZ
  const sszBytes = encodeSSZ(message);
  const sszEncoded = bytesToHex(sszBytes);

  // Compute SHA-256 hash
  const hashBytes = await sha256(sszBytes);
  const messageHash = bytesToHex(hashBytes);

  return { sszEncoded, messageHash };
}

/**
 * Verifies ECDSA signature over message hash
 * 
 * Note: In a production environment, this should use a proper ECDSA library
 * like ethers.js or web3.js. This is a placeholder for the signature verification logic.
 */
export async function verifySignature(
  messageHash: string,
  signature: string,
  signerAddress: string
): Promise<boolean> {
  // TODO: Implement actual ECDSA signature verification
  // This would typically use ethers.utils.verifyMessage or similar
  
  // Placeholder validation - in production, verify the signature cryptographically
  const isValidSignatureFormat = /^0x[0-9a-fA-F]{130}$/.test(signature);
  const isValidAddress = isValidEthereumAddress(signerAddress);
  
  if (!isValidSignatureFormat || !isValidAddress) {
    return false;
  }

  // In production, use ethers.js:
  // const recoveredAddress = ethers.utils.verifyMessage(messageHash, signature);
  // return recoveredAddress.toLowerCase() === signerAddress.toLowerCase();
  
  return true; // Placeholder
}

/**
 * Signs message hash with Web3 wallet
 */
export async function signMessageHash(
  messageHash: string,
  signerAddress: string
): Promise<string> {
  if (typeof window === 'undefined' || !window.ethereum) {
    throw new Error('Web3 provider not available');
  }

  try {
    // Request signature from Web3 wallet
    const signature = await window.ethereum.request({
      method: 'personal_sign',
      params: [messageHash, signerAddress],
    });

    return signature as string;
  } catch (error) {
    throw new Error(`Failed to sign message: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Generates signing domain for BLS signature
 */
export function getSigningDomain(): string {
  return DOMAIN_BLS_TO_EXECUTION_CHANGE;
}

/**
 * Formats validator index for display
 */
export function formatValidatorIndex(index: number): string {
  return index.toString().padStart(7, '0');
}

/**
 * Truncates address for display
 */
export function truncateAddress(address: string, chars = 4): string {
  if (!address || address.length < chars * 2 + 2) {
    return address;
  }
  return `${address.slice(0, chars + 2)}...${address.slice(-chars)}`;
}

// Extend Window interface for ethereum provider
declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
      selectedAddress?: string;
      isMetaMask?: boolean;
    };
  }
}
