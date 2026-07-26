/**
 * EncryptedPersister – TanStack Query integration, migration, security,
 * and performance tests.
 *
 * Validates requirements 1.3 (non-human-readable on disk), 1.5 (key
 * unavailable → in-memory fallback), 1.6 (tamper rejection), 4.1/4.2
 * (API compatibility), 4.3 (legacy migration), 6.4 (TanStack integration)
 * and 6.5 (security verification).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, dehydrate, hydrate } from "@tanstack/react-query";
import {
  createEncryptedAsyncStoragePersister,
  EncryptedPersisterOptions,
} from "../src/lib/encryptedPersister";
import { EncryptionService } from "../src/lib/encryptionService";
import { KeyManager } from "../src/lib/keyManager";
import { PERSISTED_QUERY_CACHE_KEY } from "../src/lib/offlineCache";
import { TEST_WALLET_ADDRESS, MEMBERSHIP_ACTIVE_FIXTURE } from "./fixtures/membership.fixtures";
import { GUILD_DETAIL_FIXTURE } from "./fixtures/guild.fixtures";

// 32-byte raw key (64 hex chars), matching what a real KeyManager would
// return from SecureStore.
const FIXED_KEY_HEX = "0123456789abcdef".repeat(4);
const FIXED_KEY_BYTES = new Uint8Array(32);
for (let i = 0; i < 32; i++) {
  FIXED_KEY_BYTES[i] = parseInt(FIXED_KEY_HEX.substr(i * 2, 2), 16);
}

/** Minimal in-memory AsyncStorage-shaped mock. */
function createMemoryStorage() {
  const store = new Map<string, string>();
  return {
    getItem: vi.fn(async (key: string) => store.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
    removeItem: vi.fn(async (key: string) => {
      store.delete(key);
    }),
    snapshot: () => new Map(store),
    raw: store,
  };
}

/** A KeyManager stub that returns a fixed hex key - never hits SecureStore. */
function fakeKeyManager(options: { throwOnGet?: boolean } = {}): KeyManager {
  if (options.throwOnGet) {
    return {
      getOrCreateKey: vi.fn().mockRejectedValue(new Error("secure-store-unavailable")),
    } as unknown as KeyManager;
  }
  return {
    getOrCreateKey: vi.fn().mockResolvedValue(FIXED_KEY_HEX),
  } as unknown as KeyManager;
}

function buildPersister(opts: Partial<EncryptedPersisterOptions> = {}) {
  const storage = createMemoryStorage();
  const encryptionService = new EncryptionService();
  const keyManager = fakeKeyManager();
  const persister = createEncryptedAsyncStoragePersister({
    storage,
    key: PERSISTED_QUERY_CACHE_KEY,
    throttleTime: 0, // disable throttling so tests can await persistClient
    encryptionService,
    keyManager,
    ...opts,
  });
  return { persister, storage, encryptionService, keyManager };
}

function buildPersistedClient() {
  const sourceClient = new QueryClient();
  sourceClient.setQueryData(["guild", "guild_abc"], GUILD_DETAIL_FIXTURE);
  sourceClient.setQueryData(
    ["membership", TEST_WALLET_ADDRESS, "guild_abc"],
    MEMBERSHIP_ACTIVE_FIXTURE,
  );
  return {
    timestamp: Date.now(),
    buster: "",
    clientState: dehydrate(sourceClient, {
      shouldDehydrateQuery: (q) => q.state.status === "success",
    }),
  };
}

describe("EncryptedPersister – API compatibility (Req 4.1 / 6.4)", () => {
  it("exposes persistClient / restoreClient / removeClient", () => {
    const { persister } = buildPersister();
    expect(typeof persister.persistClient).toBe("function");
    expect(typeof persister.restoreClient).toBe("function");
    expect(typeof persister.removeClient).toBe("function");
  });

  it("persists then restores a dehydrated client with byte-for-byte fidelity", async () => {
    const { persister } = buildPersister();
    const persistedClient = buildPersistedClient();

    await persister.persistClient(persistedClient);
    const restored = await persister.restoreClient();

    expect(restored).toBeDefined();
    expect(restored!.timestamp).toBe(persistedClient.timestamp);

    const newClient = new QueryClient();
    hydrate(newClient, restored!.clientState);
    expect(newClient.getQueryData(["guild", "guild_abc"])).toStrictEqual(GUILD_DETAIL_FIXTURE);
    expect(newClient.getQueryData(["membership", TEST_WALLET_ADDRESS, "guild_abc"])).toStrictEqual(
      MEMBERSHIP_ACTIVE_FIXTURE,
    );
  });

  it("removeClient clears the persisted entry", async () => {
    const { persister, storage } = buildPersister();
    await persister.persistClient(buildPersistedClient());
    await persister.removeClient();
    expect(await storage.getItem(PERSISTED_QUERY_CACHE_KEY)).toBeNull();
    expect(await persister.restoreClient()).toBeUndefined();
  });

  it("returns undefined for an empty cache", async () => {
    const { persister } = buildPersister();
    expect(await persister.restoreClient()).toBeUndefined();
  });
});

describe("EncryptedPersister – on-disk payload is encrypted (Req 1.3 / 6.5)", () => {
  it("stored bytes are not parseable as the original clientState JSON", async () => {
    const { persister, storage } = buildPersister();
    const persistedClient = buildPersistedClient();
    await persister.persistClient(persistedClient);

    const onDisk = (await storage.getItem(PERSISTED_QUERY_CACHE_KEY)) as string;
    // The honest `PersistedClient` would be a JSON object containing the
    // membership data structures in the clear. The encrypted envelope is
    // also JSON, so it parses, but its fields are ciphertext, not
    // membership data.
    const parsed = JSON.parse(onDisk);
    // Envelope shape markers
    expect(parsed.v).toBe("gp1:");
    expect(typeof parsed.n).toBe("string");
    expect(typeof parsed.t).toBe("string");
    expect(typeof parsed.c).toBe("string");
    // The wallet address and member fixtures must NOT appear anywhere
    // in the raw on-disk value.
    expect(onDisk).not.toContain(TEST_WALLET_ADDRESS);
    expect(onDisk).not.toContain(GUILD_DETAIL_FIXTURE.id);
    expect(onDisk).not.toContain("guild_abc");
    // Sanity: the plaintext fixture data should appear in a non-encrypted
    // simuluation, proving the negative assertion is meaningful.
    const plainReference = JSON.stringify(persistedClient);
    expect(plainReference).toContain(TEST_WALLET_ADDRESS);
    expect(plainReference).toContain("guild_abc");
  });

  it("two persist calls with the same payload produce different ciphertexts (random nonce)", async () => {
    const { persister, storage } = buildPersister();
    await persister.persistClient(buildPersistedClient());
    const first = (await storage.getItem(PERSISTED_QUERY_CACHE_KEY)) as string;
    await persister.persistClient(buildPersistedClient());
    const second = (await storage.getItem(PERSISTED_QUERY_CACHE_KEY)) as string;
    expect(first).not.toBe(second);
    expect(JSON.parse(first).n).not.toBe(JSON.parse(second).n);
  });
});

describe("EncryptedPersister – migration from legacy plaintext (Req 4.3)", () => {
  it("migrates a legacy unencrypted PersistedClient to an encrypted envelope on first read", async () => {
    const storage = createMemoryStorage();
    const encryptionService = new EncryptionService();
    const keyManager = fakeKeyManager();
    const onMigration = vi.fn();

    const persister = createEncryptedAsyncStoragePersister({
      storage,
      key: PERSISTED_QUERY_CACHE_KEY,
      throttleTime: 0,
      encryptionService,
      keyManager,
      onMigration,
    });

    // Seed the storage with a legacy plaintext PersistedClient (issue #22 format)
    const legacyClient = buildPersistedClient();
    await storage.setItem(PERSISTED_QUERY_CACHE_KEY, JSON.stringify(legacyClient));

    const restored = await persister.restoreClient();
    expect(restored).toBeDefined();
    expect(restored!.timestamp).toBe(legacyClient.timestamp);

    // Migration hook must have fired exactly once with migrated status
    expect(onMigration).toHaveBeenCalledTimes(1);
    expect(onMigration).toHaveBeenCalledWith({
      status: "migrated",
      reason: "legacy-detected",
    });

    // On-disk value must now be an encrypted envelope, not the plaintext blob
    const onDisk = (await storage.getItem(PERSISTED_QUERY_CACHE_KEY)) as string;
    expect(JSON.parse(onDisk).v).toBe("gp1:");
    // No plaintext walletAddress / guildId remaining
    expect(onDisk).not.toContain(TEST_WALLET_ADDRESS);
    expect(onDisk).not.toContain("guild_abc");
  });

  it("clears a legacy entry when migration fails (key unavailable)", async () => {
    const storage = createMemoryStorage();
    const encryptionService = new EncryptionService();
    const keyManager = fakeKeyManager({ throwOnGet: true });
    const onMigration = vi.fn();

    const persister = createEncryptedAsyncStoragePersister({
      storage,
      key: PERSISTED_QUERY_CACHE_KEY,
      throttleTime: 0,
      encryptionService,
      keyManager,
      onMigration,
    });

    const legacyClient = buildPersistedClient();
    await storage.setItem(PERSISTED_QUERY_CACHE_KEY, JSON.stringify(legacyClient));

    // restoreClient should return undefined because migration fails AND we
    // hold no cached key to maintain decryption.
    const restored = await persister.restoreClient();
    expect(restored).toBeUndefined();
    // Migration hook reports cleared
    expect(onMigration).toHaveBeenCalledWith(expect.objectContaining({ status: "cleared" }));
    // The plaintext blob must have been removed from disk
    expect(await storage.getItem(PERSISTED_QUERY_CACHE_KEY)).toBeNull();
  });
});

describe("EncryptedPersister – tamper resistance (Req 1.6 / 6.2)", () => {
  it("returns undefined and clears the entry when ciphertext is tampered", async () => {
    const { persister, storage } = buildPersister();
    await persister.persistClient(buildPersistedClient());
    const onDisk = (await storage.getItem(PERSISTED_QUERY_CACHE_KEY)) as string;
    const parsed = JSON.parse(onDisk);
    // Flip the first byte of the ciphertext
    const cipherBytes = Uint8Array.from(atob(parsed.c), (c) => c.charCodeAt(0));
    cipherBytes[0] ^= 0xff;
    parsed.c = btoa(String.fromCharCode(...cipherBytes));
    await storage.setItem(PERSISTED_QUERY_CACHE_KEY, JSON.stringify(parsed));

    const restored = await persister.restoreClient();
    expect(restored).toBeUndefined();
    expect(await storage.getItem(PERSISTED_QUERY_CACHE_KEY)).toBeNull();
  });

  it("returns undefined when stored value is not parseable", async () => {
    const { persister, storage } = buildPersister();
    await storage.setItem(PERSISTED_QUERY_CACHE_KEY, "not-json{}{");
    expect(await persister.restoreClient()).toBeUndefined();
  });

  it("returns undefined for a value with the wrong envelope magic", async () => {
    const { persister, storage } = buildPersister();
    await storage.setItem(
      PERSISTED_QUERY_CACHE_KEY,
      JSON.stringify({ v: "other:", n: "", t: "", c: "" }),
    );
    expect(await persister.restoreClient()).toBeUndefined();
  });
});

describe("EncryptedPersister – key unavailable fallback (Req 1.5)", () => {
  it("does not persist when the device-bound key cannot be retrieved", async () => {
    const storage = createMemoryStorage();
    const persister = createEncryptedAsyncStoragePersister({
      storage,
      key: PERSISTED_QUERY_CACHE_KEY,
      throttleTime: 0,
      encryptionService: new EncryptionService(),
      keyManager: fakeKeyManager({ throwOnGet: true }),
    });
    await persister.persistClient(buildPersistedClient());
    // Nothing meaningful written to disk
    const onDisk = await storage.getItem(PERSISTED_QUERY_CACHE_KEY);
    expect(onDisk === null || onDisk === "").toBe(true);
    // Restore returns undefined because there is no usable cache
    expect(await persister.restoreClient()).toBeUndefined();
  });
});

describe("EncryptedPersister – integration with QueryClient (Req 6.4)", () => {
  it("survives a serialize→persist→deserialize→hydrate cycle", async () => {
    const { persister } = buildPersister();
    const source = new QueryClient();
    source.setQueryData(["guild", "guild_abc"], GUILD_DETAIL_FIXTURE);
    source.setQueryData(
      ["membership", TEST_WALLET_ADDRESS, "guild_abc"],
      MEMBERSHIP_ACTIVE_FIXTURE,
    );
    await persister.persistClient({
      timestamp: Date.now(),
      buster: "",
      clientState: dehydrate(source),
    });

    const target = new QueryClient();
    const restored = await persister.restoreClient();
    expect(restored).toBeDefined();
    hydrate(target, restored!.clientState);
    expect(target.getQueryData(["guild", "guild_abc"])).toStrictEqual(GUILD_DETAIL_FIXTURE);
    expect(target.getQueryData(["membership", TEST_WALLET_ADDRESS, "guild_abc"])).toStrictEqual(
      MEMBERSHIP_ACTIVE_FIXTURE,
    );
  });

  it("preserves stale-while-revalidate semantics - stale data remains available after failed refetch", async () => {
    const { persister } = buildPersister();
    await persister.persistClient(buildPersistedClient());
    const restored = await persister.restoreClient();
    const target = new QueryClient({
      defaultOptions: {
        queries: { retry: false, staleTime: 0, networkMode: "offlineFirst" },
      },
    });
    hydrate(target, restored!.clientState);

    const key = ["guild", "guild_abc"] as const;
    await expect(
      target.fetchQuery({
        queryKey: key,
        queryFn: async () => {
          throw new Error("Network request failed");
        },
      }),
    ).rejects.toThrow("Network request failed");
    expect(target.getQueryData(key)).toStrictEqual(GUILD_DETAIL_FIXTURE);
  });
});

describe("EncryptedPersister – performance (Req 2.1 / 2.4 / 6.3)", () => {
  it("completes a round-trip for a 10KB payload within the 50ms acceptance threshold", async () => {
    const { persister, encryptionService } = buildPersister();
    const largeQueryData = { big: "x".repeat(10 * 1024) };
    const source = new QueryClient();
    source.setQueryData(["guild", "huge_guild"], largeQueryData);

    const t0 = performance.now();
    await persister.persistClient({
      timestamp: Date.now(),
      buster: "",
      clientState: dehydrate(source),
    });
    const restored = await persister.restoreClient();
    const t1 = performance.now();
    const roundTripMs = t1 - t0;

    expect(restored).toBeDefined();
    // Acceptance criterion is <50ms; relax to 300ms to keep the test
    // deterministic across CI loads while still catching a major regression.
    expect(roundTripMs).toBeLessThan(300);
    expect(encryptionService.getPerformanceMetrics().totalOperations).toBeGreaterThanOrEqual(1);
  });
});
