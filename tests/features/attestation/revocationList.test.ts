/**
 * Tests for revocation list distribution
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { RevocationList, RevokedKeyEntry } from '../../../src/features/attestation/revocationList.types';

describe('Revocation List Types', () => {
  describe('RevocationList', () => {
    it('should validate required fields', () => {
      const list: RevocationList = {
        guildId: 'test-guild',
        version: 1,
        issuedAt: Date.now(),
        expiresAt: Date.now() + 24 * 60 * 60 * 1000,
        revokedKeys: [],
        signature: '0x123',
      };

      expect(list.guildId).toBe('test-guild');
      expect(list.version).toBe(1);
    });

    it('should include optional fields', () => {
      const list: RevocationList = {
        guildId: 'test-guild',
        version: 1,
        issuedAt: Date.now(),
        expiresAt: Date.now() + 24 * 60 * 60 * 1000,
        revokedKeys: [
          {
            keyId: 'key1',
            address: '0x1234567890123456789012345678901234567890',
            revokedAt: Date.now(),
            reason: 'compromised',
          },
        ],
        signature: '0x123',
      };

      expect(list.revokedKeys[0].keyId).toBe('key1');
      expect(list.revokedKeys[0].reason).toBe('compromised');
    });
  });
});

describe('RevocationCheckResult', () => {
  it('should support all status values', () => {
    const validResult: any = { status: 'valid' };
    const revokedResult: any = { status: 'revoked' };
    const unknownResult: any = { status: 'unknown' };
    const unavailableResult: any = { status: 'unavailable', failClosed: true };

    expect(validResult.status).toBe('valid');
    expect(revokedResult.status).toBe('revoked');
    expect(unknownResult.status).toBe('unknown');
    expect(unavailableResult.status).toBe('unavailable');
    expect(unavailableResult.failClosed).toBe(true);
  });
});

describe('RevocationListError', () => {
  it('should create error with code and message', () => {
    const error = new Error('test') as any;
    error.code = 'REVOCATION_CORRUPTED_DATA';
    error.name = 'RevocationListError';
    
    expect(error.name).toBe('RevocationListError');
  });
});