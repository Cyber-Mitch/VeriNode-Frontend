/**
 * Unit tests for BLS-to-Execution change utilities
 */

import { describe, it, expect } from 'vitest';
import {
  isValidEthereumAddress,
  isValidBlsPublicKey,
  isValidWithdrawalCredential,
  isBlsWithdrawalCredential,
  isExecutionWithdrawalCredential,
  validateBLSToExecutionChangeMessage,
  encodeSSZ,
  constructBLSToExecutionChange,
  truncateAddress,
  formatValidatorIndex,
} from '../blsToExecutionChange';
import type { BLSToExecutionChangeMessage } from '@/types/withdrawalChange';

describe('blsToExecutionChange', () => {
  describe('isValidEthereumAddress', () => {
    it('validates correct Ethereum addresses', () => {
      expect(isValidEthereumAddress('0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb')).toBe(false); // invalid length
      expect(isValidEthereumAddress('0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1')).toBe(true);
      expect(isValidEthereumAddress('0x0000000000000000000000000000000000000000')).toBe(true);
    });

    it('rejects invalid Ethereum addresses', () => {
      expect(isValidEthereumAddress('742d35Cc6634C0532925a3b844Bc9e7595f0bEb1')).toBe(false); // missing 0x
      expect(isValidEthereumAddress('0x')).toBe(false); // too short
      expect(isValidEthereumAddress('0xZZZZ35Cc6634C0532925a3b844Bc9e7595f0bEb1')).toBe(false); // invalid hex
    });
  });

  describe('isValidBlsPublicKey', () => {
    it('validates correct BLS public keys', () => {
      const validKey = '0x' + 'a'.repeat(96);
      expect(isValidBlsPublicKey(validKey)).toBe(true);
    });

    it('rejects invalid BLS public keys', () => {
      expect(isValidBlsPublicKey('0x' + 'a'.repeat(95))).toBe(false); // too short
      expect(isValidBlsPublicKey('0x' + 'a'.repeat(97))).toBe(false); // too long
      expect(isValidBlsPublicKey('a'.repeat(96))).toBe(false); // missing 0x
    });
  });

  describe('isValidWithdrawalCredential', () => {
    it('validates correct withdrawal credentials', () => {
      const blsCredential = '0x00' + 'a'.repeat(62);
      const execCredential = '0x01' + 'b'.repeat(62);
      expect(isValidWithdrawalCredential(blsCredential)).toBe(true);
      expect(isValidWithdrawalCredential(execCredential)).toBe(true);
    });

    it('rejects invalid withdrawal credentials', () => {
      expect(isValidWithdrawalCredential('0x02' + 'a'.repeat(62))).toBe(false); // invalid prefix
      expect(isValidWithdrawalCredential('0x00' + 'a'.repeat(61))).toBe(false); // too short
    });
  });

  describe('isBlsWithdrawalCredential', () => {
    it('identifies BLS credentials', () => {
      expect(isBlsWithdrawalCredential('0x00' + 'a'.repeat(62))).toBe(true);
      expect(isBlsWithdrawalCredential('0x01' + 'a'.repeat(62))).toBe(false);
    });
  });

  describe('isExecutionWithdrawalCredential', () => {
    it('identifies execution credentials', () => {
      expect(isExecutionWithdrawalCredential('0x01' + 'a'.repeat(62))).toBe(true);
      expect(isExecutionWithdrawalCredential('0x00' + 'a'.repeat(62))).toBe(false);
    });
  });

  describe('validateBLSToExecutionChangeMessage', () => {
    it('validates correct messages', () => {
      const message: BLSToExecutionChangeMessage = {
        validatorIndex: 12345,
        fromBlsPubkey: '0x' + 'a'.repeat(96),
        toExecutionAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1',
      };

      const result = validateBLSToExecutionChangeMessage(message);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('catches invalid validator index', () => {
      const message: BLSToExecutionChangeMessage = {
        validatorIndex: -1,
        fromBlsPubkey: '0x' + 'a'.repeat(96),
        toExecutionAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1',
      };

      const result = validateBLSToExecutionChangeMessage(message);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('catches invalid BLS public key', () => {
      const message: BLSToExecutionChangeMessage = {
        validatorIndex: 12345,
        fromBlsPubkey: '0x' + 'a'.repeat(95),
        toExecutionAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1',
      };

      const result = validateBLSToExecutionChangeMessage(message);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('BLS'))).toBe(true);
    });

    it('catches invalid execution address', () => {
      const message: BLSToExecutionChangeMessage = {
        validatorIndex: 12345,
        fromBlsPubkey: '0x' + 'a'.repeat(96),
        toExecutionAddress: '0xinvalid',
      };

      const result = validateBLSToExecutionChangeMessage(message);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('execution'))).toBe(true);
    });
  });

  describe('encodeSSZ', () => {
    it('encodes message to correct length', () => {
      const message: BLSToExecutionChangeMessage = {
        validatorIndex: 12345,
        fromBlsPubkey: '0x' + 'a'.repeat(96),
        toExecutionAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1',
      };

      const encoded = encodeSSZ(message);
      expect(encoded).toBeInstanceOf(Uint8Array);
      expect(encoded.length).toBe(76); // 8 + 48 + 20
    });

    it('encodes validator index correctly', () => {
      const message: BLSToExecutionChangeMessage = {
        validatorIndex: 0x1234,
        fromBlsPubkey: '0x' + '0'.repeat(96),
        toExecutionAddress: '0x' + '0'.repeat(40),
      };

      const encoded = encodeSSZ(message);
      const view = new DataView(encoded.buffer);
      const decodedIndex = Number(view.getBigUint64(0, true));
      expect(decodedIndex).toBe(0x1234);
    });
  });

  describe('constructBLSToExecutionChange', () => {
    it('constructs message with SSZ encoding and hash', async () => {
      const message: BLSToExecutionChangeMessage = {
        validatorIndex: 12345,
        fromBlsPubkey: '0x' + 'a'.repeat(96),
        toExecutionAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1',
      };

      const result = await constructBLSToExecutionChange(message);
      
      expect(result.sszEncoded).toBeTruthy();
      expect(result.sszEncoded.startsWith('0x')).toBe(true);
      expect(result.messageHash).toBeTruthy();
      expect(result.messageHash.startsWith('0x')).toBe(true);
      expect(result.messageHash.length).toBe(66); // 0x + 64 hex chars
    });

    it('rejects invalid messages', async () => {
      const message: BLSToExecutionChangeMessage = {
        validatorIndex: -1,
        fromBlsPubkey: 'invalid',
        toExecutionAddress: 'invalid',
      };

      await expect(constructBLSToExecutionChange(message)).rejects.toThrow();
    });
  });

  describe('truncateAddress', () => {
    it('truncates long addresses', () => {
      const address = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1';
      const truncated = truncateAddress(address, 4);
      expect(truncated).toBe('0x742d...bEb1');
    });

    it('returns short addresses unchanged', () => {
      const address = '0x123';
      const truncated = truncateAddress(address, 4);
      expect(truncated).toBe(address);
    });
  });

  describe('formatValidatorIndex', () => {
    it('pads validator index', () => {
      expect(formatValidatorIndex(123)).toBe('0000123');
      expect(formatValidatorIndex(1234567)).toBe('1234567');
    });
  });
});
