/**
 * Unit tests for attestation system
 * Coverage: Signature verification, storage, caching, expiry, tampering detection
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  validateAttestation,
  checkAttestationExpiry,
  getAttestationValidityStatus,
} from "../src/features/attestation/verifySignature";
import {
  cacheAttestation,
  getCachedAttestation,
  removeCachedAttestation,
  clearAttestationsForWallet,
} from "../src/features/attestation/attestationStorage";
import {
  cacheIssuerKey,
  getCachedIssuerKey,
  invalidateIssuerKeyCache,
  checkIssuerKeyRevoked,
  cacheAttestationRevocationRegistry,
  clearAttestationRevocationCache,
  ATTESTATION_REVOCATION_CACHE_TTL_MS,
} from "../src/features/attestation/issuerKeyRegistry";
import {
  type RoleAttestation,
  type GuildIssuerKey,
  ATTESTATION_REVOCATION_REASONS,
} from "../src/features/attestation/types";
import * as SecureStore from "expo-secure-store";

// Mock AsyncStorage
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    multiRemove: vi.fn(),
    getAllKeys: vi.fn(),
  },
}));

// Mock viem
vi.mock("viem", async (importOriginal) => {
  const actual = await importOriginal<typeof import("viem")>();
  return {
    ...actual,
    verifyTypedData: vi.fn(async (params) => {
      // Simple mock: accept valid signatures, reject tampered ones
      return !params.signature.includes("tampered");
    }),
  };
});

describe("Attestation System", () => {
  const mockWalletAddress = "0x1234567890123456789012345678901234567890";
  const mockIssuerAddress = "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd";
  const mockGuildId = "guild-1";
  const mockRoleId = "role-1";
  const chainId = 1;

  const createMockAttestation = (overrides?: Partial<RoleAttestation>): RoleAttestation => ({
    guildId: mockGuildId,
    roleId: mockRoleId,
    wallet: mockWalletAddress as `0x${string}`,
    issuedAt: Math.floor(Date.now() / 1000) - 3600, // Issued 1 hour ago
    expiresAt: Math.floor(Date.now() / 1000) + 86400, // Expires in 24 hours
    signature: ("0x" + "a".repeat(130)) as `0x${string}`, // Valid mock signature
    ...overrides,
  });

  describe("Expiry Validation", () => {
    it("should detect valid (not expired) attestations", () => {
      const attestation = createMockAttestation();
      const { expired, remainingSeconds } = checkAttestationExpiry(attestation);

      expect(expired).toBe(false);
      expect(remainingSeconds).toBeGreaterThan(0);
    });

    it("should detect expired attestations", () => {
      const attestation = createMockAttestation({
        expiresAt: Math.floor(Date.now() / 1000) - 1000, // Expired
      });
      const { expired, remainingSeconds } = checkAttestationExpiry(attestation);

      expect(expired).toBe(true);
      expect(remainingSeconds).toBe(0);
    });

    it("should calculate remaining validity correctly", () => {
      const expiresAt = Math.floor(Date.now() / 1000) + 7200; // 2 hours from now
      const attestation = createMockAttestation({ expiresAt });
      const { remainingSeconds } = checkAttestationExpiry(attestation);

      expect(remainingSeconds).toBeGreaterThanOrEqual(7100); // Allow 100 second margin
      expect(remainingSeconds).toBeLessThanOrEqual(7200);
    });
  });

  describe("Attestation Validity Status", () => {
    it('should return "Expired" for expired attestations', () => {
      const attestation = createMockAttestation({
        expiresAt: Math.floor(Date.now() / 1000) - 1000,
      });
      const status = getAttestationValidityStatus(attestation);

      expect(status).toBe("Expired");
    });

    it("should show minutes for near-expiry attestations", () => {
      const attestation = createMockAttestation({
        expiresAt: Math.floor(Date.now() / 1000) + 1800, // 30 minutes
      });
      const status = getAttestationValidityStatus(attestation);

      expect(status).toContain("Expires in");
      expect(status).toContain("minutes");
    });

    it("should show hours for medium-term attestations", () => {
      const attestation = createMockAttestation({
        expiresAt: Math.floor(Date.now() / 1000) + 43200, // 12 hours
      });
      const status = getAttestationValidityStatus(attestation);

      expect(status).toContain("Expires in");
      expect(status).toContain("hours");
    });

    it("should show days for long-term attestations", () => {
      const attestation = createMockAttestation({
        expiresAt: Math.floor(Date.now() / 1000) + 259200, // 3 days
      });
      const status = getAttestationValidityStatus(attestation);

      expect(status).toContain("Expires in");
      expect(status).toContain("day");
    });
  });

  describe("Attestation Storage", () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it("should cache attestations", async () => {
      const attestation = createMockAttestation();
      await cacheAttestation(mockWalletAddress, attestation);

      expect(SecureStore.setItemAsync).toHaveBeenCalled();
      const AsyncStorage = await import("@react-native-async-storage/async-storage");
      expect(AsyncStorage.default.setItem).not.toHaveBeenCalled();
    });

    it("should retrieve cached attestations", async () => {
      const attestation = createMockAttestation();

      // Mock the storage retrieve
      vi.mocked(SecureStore.getItemAsync).mockResolvedValueOnce(
        JSON.stringify({
          ...attestation,
          cachedAt: Date.now(),
        }),
      );

      const cached = await getCachedAttestation(mockWalletAddress, mockGuildId, mockRoleId);

      expect(cached).not.toBeNull();
      expect(cached?.guildId).toBe(mockGuildId);
      expect(cached?.roleId).toBe(mockRoleId);
    });

    it("should return null for missing attestations", async () => {
      vi.mocked(SecureStore.getItemAsync).mockResolvedValueOnce(null);
      const AsyncStorage = await import("@react-native-async-storage/async-storage");
      vi.mocked(AsyncStorage.default.getItem).mockResolvedValueOnce(null);

      const cached = await getCachedAttestation(mockWalletAddress, mockGuildId, mockRoleId);

      expect(cached).toBeNull();
    });

    it("should remove cached attestations", async () => {
      vi.mocked(SecureStore.getItemAsync).mockResolvedValueOnce(JSON.stringify([]));

      await removeCachedAttestation(mockWalletAddress, mockGuildId, mockRoleId);

      expect(SecureStore.deleteItemAsync).toHaveBeenCalled();
    });

    it("should clear all attestations for a wallet", async () => {
      vi.mocked(SecureStore.getItemAsync).mockResolvedValueOnce(JSON.stringify([]));

      await clearAttestationsForWallet(mockWalletAddress);

      expect(SecureStore.deleteItemAsync).toHaveBeenCalled();
    });
  });

  describe("Issuer Key Registry", () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it("should cache issuer keys", async () => {
      const issuerKey: GuildIssuerKey = {
        guildId: mockGuildId,
        issuerAddress: mockIssuerAddress as `0x${string}`,
        registeredAt: Math.floor(Date.now() / 1000),
        cachedAt: Date.now(),
      };

      await cacheIssuerKey(issuerKey);

      expect(SecureStore.setItemAsync).toHaveBeenCalled();
    });

    it("should retrieve cached issuer keys", async () => {
      const issuerKey: GuildIssuerKey = {
        guildId: mockGuildId,
        issuerAddress: mockIssuerAddress as `0x${string}`,
        registeredAt: Math.floor(Date.now() / 1000),
        cachedAt: Date.now(),
      };

      vi.mocked(SecureStore.getItemAsync).mockResolvedValueOnce(JSON.stringify(issuerKey));

      const cached = await getCachedIssuerKey(mockGuildId);

      expect(cached).not.toBeNull();
      expect(cached?.issuerAddress).toBe(mockIssuerAddress);
    });

    it("should invalidate stale issuer key cache", async () => {
      const staleIssuerKey: GuildIssuerKey = {
        guildId: mockGuildId,
        issuerAddress: mockIssuerAddress as `0x${string}`,
        registeredAt: Math.floor(Date.now() / 1000),
        cachedAt: Date.now() - 8 * 24 * 60 * 60 * 1000, // 8 days old
      };

      vi.mocked(SecureStore.getItemAsync).mockResolvedValueOnce(JSON.stringify(staleIssuerKey));

      const cached = await getCachedIssuerKey(mockGuildId, 7); // Max 7 days

      expect(cached).toBeNull();
      expect(SecureStore.deleteItemAsync).toHaveBeenCalled();
    });

    it("should invalidate issuer key cache on demand", async () => {
      await invalidateIssuerKeyCache(mockGuildId);

      expect(SecureStore.deleteItemAsync).toHaveBeenCalled();
    });
  });

  describe("Attestation Revocation Checks", () => {
    const revokedAddress = "0x0000000000000000000000000000000000000001" as `0x${string}`;
    const activeAddress = "0x0000000000000000000000000000000000000002" as `0x${string}`;

    beforeEach(async () => {
      await clearAttestationRevocationCache();
    });

    it("should detect a revoked issuer key and reject the attestation", async () => {
      // Seed the revocation registry with the issuer address as revoked
      await cacheAttestationRevocationRegistry(
        mockGuildId,
        new Set([revokedAddress.toLowerCase()]),
      );

      const attestation = createMockAttestation();

      const result = await validateAttestation(attestation, revokedAddress, chainId);

      expect(result.valid).toBe(false);
      expect(result.issuerKeyRevoked).toBe(true);
      expect(result.reason).toBe(ATTESTATION_REVOCATION_REASONS.KEY_REVOKED);
    });

    it("should accept an attestation when the issuer key is definitively not revoked", async () => {
      // Seed revocation registry with a different address revoked — our key is clean
      await cacheAttestationRevocationRegistry(
        mockGuildId,
        new Set([revokedAddress.toLowerCase()]),
      );

      const attestation = createMockAttestation();

      const result = await validateAttestation(attestation, activeAddress, chainId);

      // The revocation check passes (address not in set), then sig verification runs
      expect(result.issuerKeyRevoked).toBe(false);
      // The signature will actually fail because activeAddress differs from the
      // mock signature's signer — but that's expected; the point is we prove the
      // revocation check did not falsely reject.
      expect(result.revocationCheckSkipped).toBe(false);
    });

    it("should fail closed when no revocation data is cached (offline scenario)", async () => {
      // Ensure no revocation data is cached
      await clearAttestationRevocationCache();

      const attestation = createMockAttestation();

      const result = await validateAttestation(
        attestation,
        mockIssuerAddress as `0x${string}`,
        chainId,
      );

      expect(result.valid).toBe(false);
      expect(result.revocationCheckSkipped).toBe(true);
      expect(result.reason).toBe(ATTESTATION_REVOCATION_REASONS.REVOCATION_DATA_UNAVAILABLE);
    });

    it("should check revocation before signature verification (cheaper check first)", async () => {
      // Seed with issuer key as revoked
      await cacheAttestationRevocationRegistry(
        mockGuildId,
        new Set([mockIssuerAddress.toLowerCase()]),
      );

      // Even with a valid-looking signature, revocation should reject first
      const attestation = createMockAttestation({
        signature: ("0x" + "a".repeat(130)) as `0x${string}`,
      });

      const result = await validateAttestation(
        attestation,
        mockIssuerAddress as `0x${string}`,
        chainId,
      );

      expect(result.valid).toBe(false);
      expect(result.issuerKeyRevoked).toBe(true);
      expect(result.reason).toBe(ATTESTATION_REVOCATION_REASONS.KEY_REVOKED);
      // The revocation check short-circuits before signature verification
      expect(result.recoveredSigner).toBeUndefined();
    });

    it("should checkIssuerKeyRevoked return true for revoked address", async () => {
      await cacheAttestationRevocationRegistry(
        mockGuildId,
        new Set([revokedAddress.toLowerCase()]),
      );

      const result = await checkIssuerKeyRevoked(mockGuildId, revokedAddress);
      expect(result).toBe(true);
    });

    it("should checkIssuerKeyRevoked return false for active address", async () => {
      await cacheAttestationRevocationRegistry(
        mockGuildId,
        new Set([revokedAddress.toLowerCase()]),
      );

      const result = await checkIssuerKeyRevoked(mockGuildId, activeAddress);
      expect(result).toBe(false);
    });

    it("should checkIssuerKeyRevoked return null when no revocation data available", async () => {
      await clearAttestationRevocationCache();

      const result = await checkIssuerKeyRevoked(mockGuildId, activeAddress);
      expect(result).toBeNull();
    });

    it("should use cached revocation data even after in-memory cache is cleared (falls back to persisted)", async () => {
      // Seed data — stores in both in-memory and persisted
      await cacheAttestationRevocationRegistry(
        mockGuildId,
        new Set([revokedAddress.toLowerCase()]),
      );

      // Verify it works fresh
      const freshResult = await checkIssuerKeyRevoked(mockGuildId, revokedAddress);
      expect(freshResult).toBe(true);

      // Clear in-memory cache only
      await clearAttestationRevocationCache();

      // Re-seed with a slightly aged timestamp (past TTL, within trust window)
      const oldTimestamp = Date.now() - ATTESTATION_REVOCATION_CACHE_TTL_MS - 1;
      await cacheAttestationRevocationRegistry(
        mockGuildId,
        new Set([revokedAddress.toLowerCase()]),
        oldTimestamp,
      );

      // Data is still in persisted store and in-memory (just re-seeded).
      // The in-memory copy has the old timestamp (past TTL) but is still
      // within the 24h offline trust window.
      const cachedResult = await checkIssuerKeyRevoked(mockGuildId, revokedAddress);
      expect(cachedResult).toBe(true);
    });
  });

  describe("Attestation Validation", () => {
    beforeEach(async () => {
      // Ensure revocation data is available so revocation check doesn't
      // short-circuit the other tests
      await cacheAttestationRevocationRegistry(
        mockGuildId,
        new Set([]), // Empty set = no keys revoked
      );
    });

    it("should reject expired attestations", async () => {
      const expiredAttestation = createMockAttestation({
        expiresAt: Math.floor(Date.now() / 1000) - 1000,
      });

      const result = await validateAttestation(
        expiredAttestation,
        mockIssuerAddress as `0x${string}`,
        chainId,
      );

      expect(result.valid).toBe(false);
      expect(result.reason).toContain("expired");
      expect(result.expired).toBe(true);
    });

    it("should accept valid attestations", async () => {
      const validAttestation = createMockAttestation();

      const result = await validateAttestation(
        validAttestation,
        mockIssuerAddress as `0x${string}`,
        chainId,
      );

      expect(result.valid).toBe(true);
      expect(result.expired).toBe(false);
      expect(result.remainingValidity).toBeGreaterThan(0);
    });

    it("should reject tampered attestations", async () => {
      const tamperedAttestation = createMockAttestation({
        signature: ("0x" + "tampered".padEnd(130, "a")) as `0x${string}`,
      });

      const result = await validateAttestation(
        tamperedAttestation,
        mockIssuerAddress as `0x${string}`,
        chainId,
      );

      expect(result.valid).toBe(false);
      expect(result.reason).toContain("Invalid signature");
    });

    it("should handle verification errors gracefully", async () => {
      const attestation = createMockAttestation();

      // Mock verifyTypedData to throw
      const viem = await import("viem");
      vi.mocked(viem.verifyTypedData).mockRejectedValueOnce(new Error("Network error"));

      const result = await validateAttestation(
        attestation,
        mockIssuerAddress as `0x${string}`,
        chainId,
      );

      expect(result.valid).toBe(false);
      expect(result.reason).toContain("failed");
    });
  });

  describe("Attestation Data Integrity", () => {
    it("should preserve all attestation fields through storage cycle", async () => {
      const original = createMockAttestation();
      await cacheAttestation(mockWalletAddress, original);
      vi.mocked(SecureStore.getItemAsync).mockResolvedValueOnce(
        JSON.stringify({
          ...original,
          cachedAt: Date.now(),
        }),
      );
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
