import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  cacheAttestationRevocationRegistry,
  cacheAttestationRevocationRegistryFromGuildConfig,
  checkIssuerKeyRevoked,
  clearAttestationRevocationCache,
  extractRevokedAttestationIssuerAddresses,
} from "../src/features/attestation/issuerKeyRegistry";

const storageState = vi.hoisted(() => {
  const items = new Map<string, string>();
  return {
    items,
    getItem: vi.fn(async (name: string) => items.get(name) ?? null),
    setItem: vi.fn(async (name: string, value: string) => {
      items.set(name, value);
    }),
    removeItem: vi.fn(async (name: string) => {
      items.delete(name);
    }),
  };
});

vi.mock("../src/lib/storage", () => ({
  migratingSecureStorage: {
    getItem: storageState.getItem,
    setItem: storageState.setItem,
    removeItem: storageState.removeItem,
  },
}));

const guildId = "guild-alpha";
const activeAddress = "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd" as const;
const revokedAddress = "0x1111111111111111111111111111111111111111" as const;

describe("attestation revocation sync from guild config", () => {
  beforeEach(async () => {
    storageState.items.clear();
    storageState.getItem.mockClear();
    storageState.setItem.mockClear();
    storageState.removeItem.mockClear();
    await clearAttestationRevocationCache();
  });

  it("extracts revoked attestation issuer addresses from supported config shapes", () => {
    const direct = extractRevokedAttestationIssuerAddresses({
      guildId,
      revokedIssuerAddresses: [revokedAddress, "not-an-address"],
    });

    const nested = extractRevokedAttestationIssuerAddresses({
      guildId,
      attestationRevocationRegistry: {
        revokedAddresses: [revokedAddress],
      },
    });

    expect(Array.from(direct ?? [])).toEqual([revokedAddress]);
    expect(Array.from(nested ?? [])).toEqual([revokedAddress]);
  });

  it("updates local revocation data after reconnect sync fetches guild config", async () => {
    const updated = await cacheAttestationRevocationRegistryFromGuildConfig(guildId, {
      guildId,
      revokedIssuerAddresses: [revokedAddress],
    });

    expect(updated).toBe(true);
    await expect(checkIssuerKeyRevoked(guildId, revokedAddress)).resolves.toBe(true);
    await expect(checkIssuerKeyRevoked(guildId, activeAddress)).resolves.toBe(false);
  });

  it("can clear a previously revoked issuer when the server returns an empty list", async () => {
    await cacheAttestationRevocationRegistry(guildId, new Set([revokedAddress]));
    await expect(checkIssuerKeyRevoked(guildId, revokedAddress)).resolves.toBe(true);

    await cacheAttestationRevocationRegistryFromGuildConfig(guildId, {
      guildId,
      revokedIssuerAddresses: [],
    });

    await expect(checkIssuerKeyRevoked(guildId, revokedAddress)).resolves.toBe(false);
  });

  it("does not poison the cache with a mismatched guild config", async () => {
    const updated = await cacheAttestationRevocationRegistryFromGuildConfig(guildId, {
      guildId: "other-guild",
      revokedIssuerAddresses: [revokedAddress],
    });

    expect(updated).toBe(false);
    await expect(checkIssuerKeyRevoked(guildId, revokedAddress)).resolves.toBeNull();
  });
});
