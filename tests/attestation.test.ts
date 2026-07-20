/**
 * Unit tests for attestation system
 * Coverage: Signature verification, storage, caching, expiry, tampering detection
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  validateAttestation,
  checkAttestationExpiry,
  getAttestationValidityStatus,
} from '../verifySignature';
import {
  cacheAttestation,
  getCachedAttestation,
  removeCachedAttestation,
  getAllAttestationsForWallet,
  clearAttestationsForWallet,
} from '../attestationStorage';
import {
  cacheIssuerKey,
  getCachedIssuerKey,
  invalidateIssuerKeyCache,
} from '../issuerKeyRegistry';
import { type RoleAttestation, type GuildIssuerKey } from '../types';

// Mock AsyncStorage
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    multiRemove: vi.fn(),
    getAllKeys: vi.fn(),
  },
}));

// Mock viem
vi.mock('viem', () => ({
  verifyTypedData: vi.fn(async (params) => {
    // Simple mock: accept valid signatures, reject tampered ones
    return !params.signature.includes('tampered');
  }),
}));

describe('Attestation System', () => {
  const mockWalletAddress = '0x1234567890123456789012345678901234567890';
  const mockIssuerAddress = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd';
  const mockGuildId = 'guild-1';
  const mockRoleId = 'role-1';
  const chainId = 1;

  const createMockAttestation = (overrides?: Partial<RoleAttestation>): RoleAttestation => ({
    guildId: mockGuildId,
    roleId: mockRoleId,
    wallet: mockWalletAddress as `0x${string}`,
    issuedAt: Math.floor(Date.now() / 1000) - 3600, // Issued 1 hour ago
    expiresAt: Math.floor(Date.now() / 1000) + 86400, // Expires in 24 hours
    signature: '0x' + 'a'.repeat(130), // Valid mock signature
    ...overrides,
  });

  describe('Expiry Validation', () => {
    it('should detect valid (not expired) attestations', () => {
      const attestation = createMockAttestation();
      const { expired, remainingSeconds } = checkAttestationExpiry(attestation);

      expect(expired).toBe(false);
      expect(remainingSeconds).toBeGreaterThan(0);
    });

    it('should detect expired attestations', () => {
      const attestation = createMockAttestation({
        expiresAt: Math.floor(Date.now() / 1000) - 1000, // Expired
      });
      const { expired, remainingSeconds } = checkAttestationExpiry(attestation);

      expect(expired).toBe(true);
      expect(remainingSeconds).toBe(0);
    });

    it('should calculate remaining validity correctly', () => {
      const expiresAt = Math.floor(Date.now() / 1000) + 7200; // 2 hours from now
      const attestation = createMockAttestation({ expiresAt });
      const { remainingSeconds } = checkAttestationExpiry(attestation);

      expect(remainingSeconds).toBeGreaterThanOrEqual(7100); // Allow 100 second margin
      expect(remainingSeconds).toBeLessThanOrEqual(7200);
    });
  });

  describe('Attestation Validity Status', () => {
    it('should return "Expired" for expired attestations', () => {
      const attestation = createMockAttestation({
        expiresAt: Math.floor(Date.now() / 1000) - 1000,
      });
      const status = getAttestationValidityStatus(attestation);

      expect(status).toBe('Expired');
    });

    it('should show minutes for near-expiry attestations', () => {
      const attestation = createMockAttestation({
        expiresAt: Math.floor(Date.now() / 1000) + 1800, // 30 minutes
      });
      const status = getAttestationValidityStatus(attestation);

      expect(status).toContain('Expires in');
      expect(status).toContain('minutes');
    });

    it('should show hours for medium-term attestations', () => {
      const attestation = createMockAttestation({
        expiresAt: Math.floor(Date.now() / 1000) + 43200, // 12 hours
      });
      const status = getAttestationValidityStatus(attestation);

      expect(status).toContain('Expires in');
      expect(status).toContain('hours');
    });

    it('should show days for long-term attestations', () => {
      const attestation = createMockAttestation({
        expiresAt: Math.floor(Date.now() / 1000) + 259200, // 3 days
      });
      const status = getAttestationValidityStatus(attestation);

      expect(status).toContain('Expires in');
      expect(status).toContain('day');
    });
  });

  describe('Attestation Storage', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should cache attestations', async () => {
      const attestation = createMockAttestation();
      await cacheAttestation(mockWalletAddress, attestation);

      // Verify AsyncStorage.setItem was called
      const AsyncStorage = await import('@react-native-async-storage/async-storage');
      expect(AsyncStorage.default.setItem).toHaveBeenCalled();
    });

    it('should retrieve cached attestations', async () => {
      const attestation = createMockAttestation();

      // Mock the storage retrieve
      const AsyncStorage = await import('@react-native-async-storage/async-storage');
      vi.mocked(AsyncStorage.default.getItem).mockResolvedValueOnce(
        JSON.stringify({
          ...attestation,
          cachedAt: Date.now(),
        })
      );

      const cached = await getCachedAttestation(mockWalletAddress, mockGuildId, mockRoleId);

      expect(cached).not.toBeNull();
      expect(cached?.guildId).toBe(mockGuildId);
      expect(cached?.roleId).toBe(mockRoleId);
    });

    it('should return null for missing attestations', async () => {
      const AsyncStorage = await import('@react-native-async-storage/async-storage');
      vi.mocked(AsyncStorage.default.getItem).mockResolvedValueOnce(null);

      const cached = await getCachedAttestation(mockWalletAddress, mockGuildId, mockRoleId);

      expect(cached).toBeNull();
    });

    it('should remove cached attestations', async () => {
      const AsyncStorage = await import('@react-native-async-storage/async-storage');
      vi.mocked(AsyncStorage.default.getItem).mockResolvedValueOnce(JSON.stringify([]));

      await removeCachedAttestation(mockWalletAddress, mockGuildId, mockRoleId);

      expect(AsyncStorage.default.removeItem).toHaveBeenCalled();
    });

    it('should clear all attestations for a wallet', async () => {
      const AsyncStorage = await import('@react-native-async-storage/async-storage');
      vi.mocked(AsyncStorage.default.getItem).mockResolvedValueOnce(null);

      await clearAttestationsForWallet(mockWalletAddress);

      expect(AsyncStorage.default.multiRemove).toHaveBeenCalled();
    });
  });

  describe('Issuer Key Registry', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should cache issuer keys', async () => {
      const issuerKey: GuildIssuerKey = {
        guildId: mockGuildId,
        issuerAddress: mockIssuerAddress as `0x${string}`,
        registeredAt: Math.floor(Date.now() / 1000),
        cachedAt: Date.now(),
      };

      await cacheIssuerKey(issuerKey);

      const AsyncStorage = await import('@react-native-async-storage/async-storage');
      expect(AsyncStorage.default.setItem).toHaveBeenCalled();
    });

    it('should retrieve cached issuer keys', async () => {
      const issuerKey: GuildIssuerKey = {
        guildId: mockGuildId,
        issuerAddress: mockIssuerAddress as `0x${string}`,
        registeredAt: Math.floor(Date.now() / 1000),
        cachedAt: Date.now(),
      };

      const AsyncStorage = await import('@react-native-async-storage/async-storage');
      vi.mocked(AsyncStorage.default.getItem).mockResolvedValueOnce(JSON.stringify(issuerKey));

      const cached = await getCachedIssuerKey(mockGuildId);

      expect(cached).not.toBeNull();
      expect(cached?.issuerAddress).toBe(mockIssuerAddress);
    });

    it('should invalidate stale issuer key cache', async () => {
      const staleIssuerKey: GuildIssuerKey = {
        guildId: mockGuildId,
        issuerAddress: mockIssuerAddress as `0x${string}`,
        registeredAt: Math.floor(Date.now() / 1000),
        cachedAt: Date.now() - 8 * 24 * 60 * 60 * 1000, // 8 days old
      };

      const AsyncStorage = await import('@react-native-async-storage/async-storage');
      vi.mocked(AsyncStorage.default.getItem).mockResolvedValueOnce(
        JSON.stringify(staleIssuerKey)
      );

      const cached = await getCachedIssuerKey(mockGuildId, 7); // Max 7 days

      expect(cached).toBeNull();
      expect(AsyncStorage.default.removeItem).toHaveBeenCalled();
    });

    it('should invalidate issuer key cache on demand', async () => {
      const AsyncStorage = await import('@react-native-async-storage/async-storage');

      await invalidateIssuerKeyCache(mockGuildId);

      expect(AsyncStorage.default.removeItem).toHaveBeenCalled();
    });
  });

  describe('Attestation Validation', () => {
    it('should reject expired attestations', async () => {
      const expiredAttestation = createMockAttestation({
        expiresAt: Math.floor(Date.now() / 1000) - 1000,
      });

      const result = await validateAttestation(
        expiredAttestation,
        mockIssuerAddress as `0x${string}`,
        chainId
      );

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('expired');
      expect(result.expired).toBe(true);
    });

    it('should accept valid attestations', async () => {
      const validAttestation = createMockAttestation();

      const result = await validateAttestation(
        validAttestation,
        mockIssuerAddress as `0x${string}`,
        chainId
      );

      expect(result.valid).toBe(true);
      expect(result.expired).toBe(false);
      expect(result.remainingValidity).toBeGreaterThan(0);
    });

    it('should reject tampered attestations', async () => {
      const tamperedAttestation = createMockAttestation({
        signature: '0x' + 'tampered'.padEnd(130, 'a'),
      });

      const result = await validateAttestation(
        tamperedAttestation,
        mockIssuerAddress as `0x${string}`,
        chainId
      );

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('Invalid signature');
    });

    it('should handle verification errors gracefully', async () => {
      const attestation = createMockAttestation();

      // Mock verifyTypedData to throw
      const viem = await import('viem');
      vi.mocked(viem.verifyTypedData).mockRejectedValueOnce(new Error('Network error'));

      const result = await validateAttestation(
        attestation,
        mockIssuerAddress as `0x${string}`,
        chainId
      );

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('failed');
    });
  });

  describe('Attestation Data Integrity', () => {
    it('should preserve all attestation fields through storage cycle', async () => {
      const original = createMockAttestation();
      const AsyncStorage = await import('@react-native-async-storage/async-storage');

      // Mock successful storage and retrieval
      vi.mocked(AsyncStorage.default.getItem).mockResolvedValueOnce(
        JSON.stringify({
          ...original,
          cachedAt: Date.now(),
        })
      );

      await cacheAttestation(mockWalletAddress, original);
      const retrieved = await getCachedAttestation(mockWalletAddress, mockGuildId, mockRoleId);

      expect(retrieved?.guildId).toBe(original.guildId);
      expect(retrieved?.roleId).toBe(original.roleId);
      expect(retrieved?.wallet).toBe(original.wallet);
      expect(retrieved?.issuedAt).toBe(original.issuedAt);
      expect(retrieved?.expiresAt).toBe(original.expiresAt);
      expect(retrieved?.signature).toBe(original.signature);
    });
  });
});
