import { beforeEach, describe, expect, it, vi } from "vitest";
import * as SecureStore from "expo-secure-store";
import { KeyManager } from "../src/lib/keyManager";
import { createEncryptedAsyncStoragePersister } from "../src/lib/encryptedPersister";
import { EncryptionService } from "../src/lib/encryptionService";
import { QueryClient, dehydrate } from "@tanstack/react-query";
import { PERSISTED_QUERY_CACHE_KEY } from "../src/lib/offlineCache";

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

describe("KeyManager Key-Rotation Lifecycle E2E Test", () => {
  const secureStoreMock = new Map<string, string>();

  beforeEach(() => {
    secureStoreMock.clear();

    // Mock SecureStore functions to use our in-memory mock map.
    vi.mocked(SecureStore.getItemAsync).mockImplementation(async (key: string) => {
      return secureStoreMock.get(key) ?? null;
    });

    vi.mocked(SecureStore.setItemAsync).mockImplementation(async (key: string, value: string) => {
      secureStoreMock.set(key, value);
    });

    vi.mocked(SecureStore.deleteItemAsync).mockImplementation(async (key: string) => {
      secureStoreMock.delete(key);
    });

    // Ensure sleep doesn't actually delay tests
    // @ts-expect-error - stubbing private method
    vi.spyOn(KeyManager.prototype, "sleep").mockResolvedValue(undefined);

    // Force secure store availability for the test environment
    // @ts-expect-error - stubbing private method
    vi.spyOn(KeyManager.prototype, "isSecureStoreAvailable").mockResolvedValue(true);
  });

  it("should keep previously encrypted offline cache readable after rotation", async () => {
    // 1. Initialize KeyManager with a test-specific key ID
    const keyManager = new KeyManager({ keyId: "test_rotation_lifecycle_key" });
    const encryptionService = new EncryptionService();
    const storage = createMemoryStorage();

    // 2. Encrypt and persist sample data under the initial key
    const persister1 = createEncryptedAsyncStoragePersister({
      storage,
      key: PERSISTED_QUERY_CACHE_KEY,
      throttleTime: 0, // disable throttling for test immediacy
      encryptionService,
      keyManager,
    });

    const queryClient = new QueryClient();
    queryClient.setQueryData(["guild", "my_guild"], { name: "Adventures" });

    const clientData = {
      timestamp: Date.now(),
      buster: "",
      clientState: dehydrate(queryClient),
    };

    // This performs encryption and writes the versioned envelope to storage
    await persister1.persistClient(clientData);

    // Verify it is on disk with correct envelope magic prefix
    const storedBeforeRotation = await storage.getItem(PERSISTED_QUERY_CACHE_KEY);
    expect(storedBeforeRotation).toBeDefined();
    expect(storedBeforeRotation).toContain("gp1:");

    // Verify we can successfully deserialize/restore it before rotation
    const restoredBeforeRotation = await persister1.restoreClient();
    expect(restoredBeforeRotation).toBeDefined();
    expect(restoredBeforeRotation?.clientState).toBeDefined();

    // 3. Mark the key as expired so the next persister session coordinates a rotation.
    const oldKey = await keyManager.getKey();
    secureStoreMock.set(
      "test_rotation_lifecycle_key_timestamp",
      (Date.now() - 35 * 24 * 60 * 60 * 1000).toString(),
    );

    // 4. Create a fresh persister instance to simulate a new app session/launch.
    // This is critical because EncryptedPersister internally caches the key buffer
    // in closure scope (`cachedKeyBuffer`) for the lifetime of its instance.
    // Simulating a fresh instance ensures it pulls the new key from KeyManager.
    const persister2 = createEncryptedAsyncStoragePersister({
      storage,
      key: PERSISTED_QUERY_CACHE_KEY,
      throttleTime: 0,
      encryptionService,
      keyManager,
    });

    // 5. Attempt to restore/deserialize the previously-encrypted data.
    // The persister should re-encrypt the envelope before KeyManager commits
    // the new key, so a fresh app session remains able to hydrate offline data.
    const restoredAfterRotation = await persister2.restoreClient();
    const rotatedKey = await keyManager.getKey();
    expect(rotatedKey).toBeDefined();
    expect(rotatedKey).not.toBe(oldKey);
    expect(restoredAfterRotation).toBeDefined();
    expect(restoredAfterRotation?.clientState).toBeDefined();

    // The cache should remain present, now encrypted under the rotated key.
    const storedAfterRotation = await storage.getItem(PERSISTED_QUERY_CACHE_KEY);
    expect(storedAfterRotation).toBeDefined();
    expect(storedAfterRotation).toContain("gp1:");
  });
});
