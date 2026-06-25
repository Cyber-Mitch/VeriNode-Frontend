/**
 * Unit tests for audit chain utilities
 */

import { describe, it, expect } from 'vitest';
import {
  createAuditEntry,
  verifyAuditChain,
  getGenesisHash,
  formatAuditEntry,
  exportAuditChain,
  importAuditChain,
} from '../auditChain';
import type { AuditLogEntry } from '@/types/withdrawalChange';

describe('auditChain', () => {
  describe('createAuditEntry', () => {
    it('creates valid audit entry', async () => {
      const entry = await createAuditEntry(
        'req_123',
        'created',
        '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1',
        getGenesisHash()
      );

      expect(entry.id).toBeTruthy();
      expect(entry.requestId).toBe('req_123');
      expect(entry.eventType).toBe('created');
      expect(entry.actor).toBe('0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1');
      expect(entry.previousHash).toBe(getGenesisHash());
      expect(entry.entryHash).toBeTruthy();
      expect(entry.entryHash.startsWith('0x')).toBe(true);
    });

    it('includes optional data', async () => {
      const entry = await createAuditEntry(
        'req_123',
        'signature_added',
        '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1',
        getGenesisHash(),
        {
          data: { count: 1 },
        }
      );

      expect(entry.data).toEqual({ count: 1 });
    });

    it('includes state changes', async () => {
      const entry = await createAuditEntry(
        'req_123',
        'state_changed',
        '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1',
        getGenesisHash(),
        {
          previousState: 'draft',
          newState: 'pending_approval',
        }
      );

      expect(entry.previousState).toBe('draft');
      expect(entry.newState).toBe('pending_approval');
    });
  });

  describe('verifyAuditChain', () => {
    it('verifies valid chain', async () => {
      const entry1 = await createAuditEntry(
        'req_123',
        'created',
        'actor1',
        getGenesisHash()
      );

      const entry2 = await createAuditEntry(
        'req_123',
        'signature_added',
        'actor2',
        entry1.entryHash
      );

      const entry3 = await createAuditEntry(
        'req_123',
        'state_changed',
        'actor3',
        entry2.entryHash
      );

      const result = await verifyAuditChain([entry1, entry2, entry3]);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.lastValidIndex).toBe(2);
    });

    it('detects tampered entry hash', async () => {
      const entry1 = await createAuditEntry(
        'req_123',
        'created',
        'actor1',
        getGenesisHash()
      );

      const entry2 = await createAuditEntry(
        'req_123',
        'signature_added',
        'actor2',
        entry1.entryHash
      );

      // Tamper with entry2's hash
      const tamperedEntry2: AuditLogEntry = {
        ...entry2,
        entryHash: '0x' + '0'.repeat(64),
      };

      const result = await verifyAuditChain([entry1, tamperedEntry2]);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.lastValidIndex).toBe(0);
    });

    it('detects broken chain linkage', async () => {
      const entry1 = await createAuditEntry(
        'req_123',
        'created',
        'actor1',
        getGenesisHash()
      );

      const entry2 = await createAuditEntry(
        'req_123',
        'signature_added',
        'actor2',
        '0x' + 'bad'.repeat(21) + 'f' // Wrong previous hash
      );

      const result = await verifyAuditChain([entry1, entry2]);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Previous hash'))).toBe(true);
      expect(result.lastValidIndex).toBe(0);
    });

    it('validates empty chain', async () => {
      const result = await verifyAuditChain([]);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.lastValidIndex).toBe(-1);
    });

    it('checks first entry has genesis hash', async () => {
      const entry = await createAuditEntry(
        'req_123',
        'created',
        'actor1',
        '0x' + 'bad'.repeat(21) + 'f'
      );

      const result = await verifyAuditChain([entry]);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('genesis'))).toBe(true);
    });
  });

  describe('getGenesisHash', () => {
    it('returns consistent genesis hash', () => {
      const hash1 = getGenesisHash();
      const hash2 = getGenesisHash();
      expect(hash1).toBe(hash2);
      expect(hash1).toBe('0x0000000000000000000000000000000000000000000000000000000000000000');
    });
  });

  describe('formatAuditEntry', () => {
    it('formats basic entry', async () => {
      const entry = await createAuditEntry(
        'req_123',
        'created',
        '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1',
        getGenesisHash()
      );

      const formatted = formatAuditEntry(entry);
      expect(formatted).toContain('Event: created');
      expect(formatted).toContain('Actor: 0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1');
    });

    it('formats state change entry', async () => {
      const entry = await createAuditEntry(
        'req_123',
        'state_changed',
        'actor1',
        getGenesisHash(),
        {
          previousState: 'draft',
          newState: 'pending_approval',
        }
      );

      const formatted = formatAuditEntry(entry);
      expect(formatted).toContain('State: draft → pending_approval');
    });

    it('formats entry with data', async () => {
      const entry = await createAuditEntry(
        'req_123',
        'signature_added',
        'actor1',
        getGenesisHash(),
        {
          data: { count: 1 },
        }
      );

      const formatted = formatAuditEntry(entry);
      expect(formatted).toContain('Data:');
      expect(formatted).toContain('count');
    });
  });

  describe('exportAuditChain', () => {
    it('exports chain to JSON', async () => {
      const entry1 = await createAuditEntry(
        'req_123',
        'created',
        'actor1',
        getGenesisHash()
      );

      const entry2 = await createAuditEntry(
        'req_123',
        'signature_added',
        'actor2',
        entry1.entryHash
      );

      const exported = exportAuditChain([entry1, entry2]);
      const parsed = JSON.parse(exported);

      expect(parsed.version).toBe('1.0');
      expect(parsed.exportedAt).toBeTruthy();
      expect(parsed.entries).toHaveLength(2);
      expect(parsed.entries[0].id).toBe(entry1.id);
    });

    it('sorts entries by timestamp', async () => {
      const entry1 = await createAuditEntry(
        'req_123',
        'created',
        'actor1',
        getGenesisHash()
      );

      // Create entry2 with earlier timestamp
      const entry2 = await createAuditEntry(
        'req_123',
        'signature_added',
        'actor2',
        entry1.entryHash
      );
      entry2.timestamp = entry1.timestamp - 1000;

      const exported = exportAuditChain([entry1, entry2]);
      const parsed = JSON.parse(exported);

      expect(parsed.entries[0].timestamp).toBeLessThan(parsed.entries[1].timestamp);
    });
  });

  describe('importAuditChain', () => {
    it('imports valid JSON', async () => {
      const entry1 = await createAuditEntry(
        'req_123',
        'created',
        'actor1',
        getGenesisHash()
      );

      const entry2 = await createAuditEntry(
        'req_123',
        'signature_added',
        'actor2',
        entry1.entryHash
      );

      const exported = exportAuditChain([entry1, entry2]);
      const imported = importAuditChain(exported);

      expect(imported).toHaveLength(2);
      expect(imported[0].id).toBe(entry1.id);
      expect(imported[1].id).toBe(entry2.id);
    });

    it('rejects invalid JSON', () => {
      expect(() => importAuditChain('invalid json')).toThrow();
    });

    it('rejects malformed structure', () => {
      const malformed = JSON.stringify({ wrong: 'structure' });
      expect(() => importAuditChain(malformed)).toThrow();
    });
  });
});
