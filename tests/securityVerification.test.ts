/**
 * Security verification for the encrypted offline cache.
 *
 * Pin-down tests asserting the security invariants required by the issue's
 * acceptance criteria:
 *   - Cache files on disk are not human-readable without the device-bound key
 *   - Authentication tag prevents tampering (no decrypted content leaks)
 *   - The encryption key is never written to AsyncStorage (only SecureStore)
 *
 * These tests are intentionally narrow and behavior-focused so they double as
 * living documentation of the threat model. See SECURITY.md for the canonical
 * description.
 */

import { describe, expect, it, vi } from "vitest";
import { QueryClient, dehydrate } from "@tanstack/react-query";
import { createEncryptedAsyncStoragePersister } from "../src/lib/encryptedPersister";
import { EncryptionService } from "../src/lib/encryptionService";
import { KeyManager } from "../src/lib/keyManager";
import { PERSISTED_QUERY_CACHE_KEY } from "../src/lib/offlineCache";
import { enforcePinConfigurationAtStartup } from "../src/features/security/certificatePinning";
import {
  TEST_WALLET_ADDRESS,
  MEMBERSHIP_ACTIVE_FIXTURE,
} from "./fixtures/membership.fixtures";
import { GUILD_DETAIL_FIXTURE } from "./fixtures/guild.fixtures";

const FIXED_KEY_HEX = "fedcba9876543210".repeat(4);

function memoryStorage() {
  const store = new Map<string, string>();
  return {
    getItem: vi.fn(async (k: string) => store.get(k) ?? null),
    setItem: vi.fn(async (k: string, v: string) => void store.set(k, v)),
    removeItem: vi.fn(async (k: string) => void store.delete(k)),
    snapshot: () => new Map(store),
  };
}

function fakeKeyManager(): KeyManager {
  return {
    getOrCreateKey: vi.fn().mockResolvedValue(FIXED_KEY_HEX),
  } as unknown as KeyManager;
}

describe("Security verification – on-disk opacity (Req 1.3 / 6.5)", () => {
  it("stored cache bytes are not human-readable", async () => {
    const storage = memoryStorage();
    const persister = createEncryptedAsyncStoragePersister({
      storage,
      key: PERSISTED_QUERY_CACHE_KEY,
      throttleTime: 0,
      encryptionService: new EncryptionService(),
      keyManager: fakeKeyManager(),
    });
    const source = new QueryClient();
    source.setQueryData(
      ["guild", "guild_abc"],
      GUILD_DETAIL_FIXTURE,
    );
    source.setQueryData(
      ["membership", TEST_WALLET_ADDRESS, "guild_abc"],
      MEMBERSHIP_ACTIVE_FIXTURE,
    );
    await persister.persistClient({
      timestamp: Date.now(),
      buster: "",
      clientState: dehydrate(source),
    });

    const onDisk = (await storage.getItem(PERSISTED_QUERY_CACHE_KEY)) as string;

    // Wallet address, guild identifier, role names, and personal data
    // must not appear anywhere in the on-disk representation.
    for (const forbidden of [
      TEST_WALLET_ADDRESS,
      "guild_abc",
      GUILD_DETAIL_FIXTURE.name,
      GUILD_DETAIL_FIXTURE.ownerAddress,
      MEMBERSHIP_ACTIVE_FIXTURE.joinedAt ?? "",
      "membership",
      "guild",
    ]) {
      if (forbidden) {
        expect(onDisk).not.toContain(forbidden);
      }
    }
  });
});

describe("Security verification – no plaintext fallback (Req 1.5)", () => {
  it("does not write the cache key, wallet address, or session token to AsyncStorage", async () => {
    const storage = memoryStorage();
    const persister = createEncryptedAsyncStoragePersister({
      storage,
      key: PERSISTED_QUERY_CACHE_KEY,
      throttleTime: 0,
      encryptionService: new EncryptionService(),
      keyManager: fakeKeyManager(),
    });
    const source = new QueryClient();
    source.setQueryData(
      ["membership", TEST_WALLET_ADDRESS, "guild_abc"],
      MEMBERSHIP_ACTIVE_FIXTURE,
    );
    await persister.persistClient({
      timestamp: Date.now(),
      buster: "",
      clientState: dehydrate(source),
    });

    // Only one key should exist in AsyncStorage, holding an envelope.
    expect(storage.snapshot().size).toBe(1);
    const onlyKey = Array.from(storage.snapshot().keys())[0];
    expect(onlyKey).toBe(PERSISTED_QUERY_CACHE_KEY);

    // The raw AES key hex must NOT be found anywhere in the persisted value.
    const onDisk = (await storage.getItem(PERSISTED_QUERY_CACHE_KEY)) as string;
    expect(onDisk).not.toContain(FIXED_KEY_HEX);
  });
});

describe("Security verification – tamper resistance (Req 1.6 / 6.2)", () => {
  it("flipping a ciphertext bit yields no decrypted membership data", async () => {
    const storage = memoryStorage();
    const persister = createEncryptedAsyncStoragePersister({
      storage,
      key: PERSISTED_QUERY_CACHE_KEY,
      throttleTime: 0,
      encryptionService: new EncryptionService(),
      keyManager: fakeKeyManager(),
    });
    const source = new QueryClient();
    source.setQueryData(
      ["membership", TEST_WALLET_ADDRESS, "guild_abc"],
      MEMBERSHIP_ACTIVE_FIXTURE,
    );
    await persister.persistClient({
      timestamp: Date.now(),
      buster: "",
      clientState: dehydrate(source),
    });

    const onDisk = (await storage.getItem(PERSISTED_QUERY_CACHE_KEY)) as string;
    const envelope = JSON.parse(onDisk);
    const cipherBytes = Uint8Array.from(atob(envelope.c), (c) =>
      c.charCodeAt(0),
    );
    cipherBytes[0] ^= 0xff;
    envelope.c = btoa(String.fromCharCode(...cipherBytes));
    await storage.setItem(PERSISTED_QUERY_CACHE_KEY, JSON.stringify(envelope));

    const restored = await persister.restoreClient();
    expect(restored).toBeUndefined();

    // Verify the corrupted entry was proactively cleared.
    expect(await storage.getItem(PERSISTED_QUERY_CACHE_KEY)).toBeNull();
  });
});

describe("Security verification – certificate pin startup gate (issue #164)", () => {
  const placeholderValidation = {
    valid: false as const,
    errors: [
      'Pin "guildpass-primary-2026" is a placeholder. Replace with an actual SPKI SHA-256 hash.',
    ],
  };

  const healthyValidation = {
    valid: true as const,
    errors: [] as string[],
  };

  it("blocks production builds when pin configuration is invalid", () => {
    expect(() =>
      enforcePinConfigurationAtStartup("production", placeholderValidation),
    ).toThrow(/Certificate pinning is misconfigured for a production build/);
  });

  it("blocks preview builds when pin configuration is invalid", () => {
    expect(() =>
      enforcePinConfigurationAtStartup("preview", placeholderValidation),
    ).toThrow(/Certificate pinning is misconfigured for a preview build/);
  });

  it("does not block development builds when pins are placeholders", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(() =>
      enforcePinConfigurationAtStartup("development", placeholderValidation),
    ).not.toThrow();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("is a no-op when pin configuration is valid in any environment", () => {
    for (const env of ["development", "preview", "production"] as const) {
      expect(() =>
        enforcePinConfigurationAtStartup(env, healthyValidation),
      ).not.toThrow();
    }
  });
});
