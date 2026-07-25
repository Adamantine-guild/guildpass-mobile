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

  it("should successfully persist under initial key, and then fail decryption (data loss / undefined) after rotation", async () => {
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

    // 3. Trigger KeyManager.rotateKey() which generates and stores a new key
    const oldKey = await keyManager.getKey();
    const newKey = await keyManager.rotateKey();
    expect(oldKey).not.toBe(newKey);

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

    // 5. Attempt to restore/deserialize the previously-encrypted data
    const restoredAfterRotation = await persister2.restoreClient();

    // --- ASSERTIONS & DOCUMENTATION OF ACTUAL BEHAVIOR ---
    //
    // Note: The KeyManager's `rotateKey` method states:
    // "Note: Old encrypted data should be re-encrypted with the new key.
    // This is handled by the EncryptedPersister during migration"
    //
    // However, the current EncryptedPersister only supports migrating legacy
    // plaintext (unencrypted) data to encrypted format, and does not perform
    // any key rotation migration.
    //
    // As a result:
    // - Decryption fails because it attempts to decrypt the old ciphertext using the new key.
    // - EncryptedPersister treats the decryption failure as a potential tampering event.
    // - The persister clears the cached entry from storage to maintain security/integrity.
    // - restoreClient() returns `undefined`.
    //
    // This represents a silent data loss bug during key rotation, which is documented here
    // for the companion fix issue to resolve.
    
    // The restoreClient should return undefined on decryption failure
    expect(restoredAfterRotation).toBeUndefined();

    // The old cache should have been cleared/evicted from storage to avoid corrupted states
    const storedAfterRotation = await storage.getItem(PERSISTED_QUERY_CACHE_KEY);
    expect(storedAfterRotation).toBeNull();
  });
});
