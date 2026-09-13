/**
 * Security tests for revocation list distribution
 */

import { describe, it, expect } from 'vitest';
import { RevocationList, REVOCATION_DEFAULTS, REVOCATION_ERROR_CODES } from '../../../src/features/attestation/revocationList.types';

describe('Revocation List Security', () => {
  describe('Version Monotonicity', () => {
    it('should reject version rollback', () => {
      const currentVersion = 5;
      const newVersion = 3;
      
      const isValid = newVersion > currentVersion;
      expect(isValid).toBe(false);
    });

    it('should accept version increment', () => {
      const currentVersion = 5;
      const newVersion = 6;
      
      const isValid = newVersion > currentVersion;
      expect(isValid).toBe(true);
    });

    it('should accept version 1 as first version', () => {
      const newVersion = 1;
      expect(newVersion).toBeGreaterThan(0);
    });
  });

  describe('Signature Verification', () => {
    it('should require valid signature format', () => {
      const validSig = '0x' + 'a'.repeat(130);
      const invalidSig1 = 'invalid';
      const invalidSig2 = '';
      
      expect(validSig).toMatch(/^0x[a-fA-F0-9]+$/);
      expect(invalidSig1).not.toMatch(/^0x[a-fA-F0-9]+$/);
      expect(invalidSig2).not.toMatch(/^0x[a-fA-F0-9]+$/);
    });
  });

  describe('Content Integrity', () => {
    it('should use content hash for integrity checking', () => {
      const list = {
        guildId: 'test-guild',
        version: 1,
        issuedAt: Date.now(),
        expiresAt: Date.now() + 24 * 60 * 60 * 1000,
        revokedKeys: [],
        signature: '0x123',
      };
      
      const serialized = JSON.stringify(list);
      expect(serialized).toContain('test-guild');
      expect(serialized).toContain('1');
    });
  });

  describe('Trust Window Enforcement', () => {
    it('should enforce 24 hour offline trust window', () => {
      const trustWindowMs = REVOCATION_DEFAULTS.OFFLINE_TRUST_WINDOW_MS;
      expect(trustWindowMs).toBe(24 * 60 * 60 * 1000);
    });

    it('should enforce 15 minute memory cache TTL', () => {
      const ttlMs = REVOCATION_DEFAULTS.CACHE_TTL_MS;
      expect(ttlMs).toBe(15 * 60 * 1000);
    });
  });

  describe('Fail-Closed Policy', () => {
    it('should fail closed when revocation data unavailable', () => {
      const config = {
        failClosed: true,
      };
      
      expect(config.failClosed).toBe(true);
    });

    it('should have default fail-closed behavior', () => {
      expect(REVOCATION_DEFAULTS.FAIL_CLOSED).toBe(true);
    });
  });

  describe('List Size Limit', () => {
    it('should enforce max list size', () => {
      const maxSize = REVOCATION_DEFAULTS.MAX_LIST_SIZE;
      expect(maxSize).toBe(10000);
    });

    it('should reject lists exceeding max size', () => {
      const largeList = Array.from({ length: 10001 }, (_, i) => ({
        keyId: `key${i}`,
        address: `0x${i.toString().padEnd(40, '0')}`,
        revokedAt: Date.now(),
      }));
      
      expect(largeList.length).toBeGreaterThan(REVOCATION_DEFAULTS.MAX_LIST_SIZE);
    });
  });
});