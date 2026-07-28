import { describe, it, expect, vi, beforeEach } from "vitest";
import { useWalletStore } from "../src/features/wallet/wallet.store";
import { useSessionStore } from "../src/features/session/session.store";
import { useSyncStore } from "../src/features/sync/sync.store";
import { useReconciliationStore } from "../src/features/notifications/reconciliation.store";
import {
  cacheAttestation,
  getCachedAttestation,
} from "../src/features/attestation/attestationStorage";
import { cacheIssuerKey } from "../src/features/attestation/issuerKeyRegistry";
import { resetAppState } from "../src/lib/resetAppState";
import {
  getSecureStorageKey,
  migrateLegacySensitiveStorage,
  migratingSecureStorage,
} from "../src/lib/storage";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";

vi.mock("../src/lib/queryClient", () => ({
  queryClient: { clear: vi.fn() },
}));

vi.mock("../src/lib/queryPersister", () => ({
  asyncStoragePersister: { removeClient: vi.fn(async () => undefined) },
}));

function previousHexSecureStorageKey(name: string): string {
  let encoded = "";
  for (let index = 0; index < name.length; index += 1) {
    encoded += name.charCodeAt(index).toString(16).padStart(4, "0");
  }
  return `gp.${encoded}`;
}

describe("Persistence and Rehydration", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    useWalletStore.setState({ walletAddress: null, isConnected: false, _hasHydrated: false });
    useSessionStore.setState({
      status: "unauthenticated",
      walletAddress: null,
      token: null,
      expiresAt: null,
      _hasHydrated: false,
    });
    useSyncStore.setState({ entityMeta: {}, corrections: [], _hasHydrated: false });
    useReconciliationStore.setState({ versions: {}, _hasHydrated: false });
    await new Promise((resolve) => setTimeout(resolve, 0));
    vi.clearAllMocks();
  });

  it("migrates legacy wallet state from AsyncStorage into SecureStore", async () => {
    const mockWalletData = JSON.stringify({
      state: {
        walletAddress: "0x1234567890123456789012345678901234567890",
        isConnected: true,
        connectionKind: "manual",
      },
      version: 0,
    });

    vi.mocked(SecureStore.getItemAsync).mockResolvedValueOnce(null);
    vi.mocked(AsyncStorage.getItem).mockResolvedValueOnce(mockWalletData);

    await useWalletStore.persist.rehydrate();

    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      "wallet-storage",
      mockWalletData,
      expect.objectContaining({
        keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      }),
    );
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith("wallet-storage");
    expect(useWalletStore.getState()).toMatchObject({
      walletAddress: "0x1234567890123456789012345678901234567890",
      isConnected: true,
      connectionKind: "manual",
    });
  });

  it("never writes wallet identifiers or session data to AsyncStorage", async () => {
    const walletAddress = "0x1234567890123456789012345678901234567890";
    const issuerAddress = "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd";
    const encodedWalletAddress = previousHexSecureStorageKey(walletAddress).slice(3);
    const encodedIssuerAddress = previousHexSecureStorageKey(issuerAddress).slice(3);
    useWalletStore.getState().setWalletAddress(walletAddress, "walletconnect");
    await useSessionStore.getState().startSession(walletAddress);
    useSyncStore.getState().recordEntityMetaBatch({
      [`["membership","${walletAddress}","guild-1"]`]: {
        lastSyncedAt: 1,
        version: "v1",
      },
    });
    useReconciliationStore.getState().setVersion({ guildId: "guild-1", walletAddress }, 1);
    await cacheAttestation(walletAddress, {
      guildId: "guild-1",
      roleId: "role-1",
      wallet: walletAddress,
      issuedAt: 1,
      expiresAt: 2,
      signature: `0x${"a".repeat(130)}`,
    });
    await cacheIssuerKey({
      guildId: "guild-1",
      issuerAddress,
      registeredAt: 1,
      cachedAt: 2,
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      "wallet-storage",
      expect.stringContaining("0x1234567890123456789012345678901234567890"),
      expect.any(Object),
    );
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      "session-storage",
      expect.stringContaining("noop:0x1234567890123456789012345678901234567890"),
      expect.any(Object),
    );
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      "sync-storage",
      expect.stringContaining(walletAddress),
      expect.any(Object),
    );
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      getSecureStorageKey("guildpass:reconciliation:v1"),
      expect.stringContaining(walletAddress),
      expect.any(Object),
    );
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      getSecureStorageKey(`guildpass:attestations:${walletAddress}:guild-1:role-1`),
      expect.stringContaining(walletAddress),
      expect.any(Object),
    );

    for (const [key] of vi.mocked(SecureStore.setItemAsync).mock.calls) {
      expect(key).toMatch(/^[\w.-]+$/);
      expect(key).not.toContain(walletAddress);
      expect(key).not.toContain(encodedWalletAddress);
      expect(key).not.toContain(encodedIssuerAddress);
    }

    expect(JSON.stringify(vi.mocked(AsyncStorage.setItem).mock.calls)).not.toContain(walletAddress);
    expect(JSON.stringify(vi.mocked(AsyncStorage.setItem).mock.calls)).not.toContain(issuerAddress);
  });

  it("uses opaque SecureStore keys for dynamic names containing wallet identifiers", () => {
    const walletAddress = "0x1234567890123456789012345678901234567890";
    const storageName = `guildpass:attestations:${walletAddress}:guild-1:role-1`;
    const secureKey = getSecureStorageKey(storageName);

    expect(secureKey).toMatch(/^gp\.[0-9a-f]{64}$/);
    expect(secureKey).not.toContain(walletAddress);
    expect(secureKey).not.toBe(previousHexSecureStorageKey(storageName));
    expect(getSecureStorageKey("wallet-storage")).toBe("wallet-storage");
    expect(getSecureStorageKey(`wallet.${walletAddress.slice(2)}`)).toMatch(/^gp\.[0-9a-f]{64}$/);
  });

  it("migrates the previous reversible SecureStore key format to the opaque format", async () => {
    const walletAddress = "0x1234567890123456789012345678901234567890";
    const storageName = `guildpass:attestations:${walletAddress}:guild-1:role-1`;
    const oldKey = previousHexSecureStorageKey(storageName);
    const newKey = getSecureStorageKey(storageName);
    const storedValue = JSON.stringify({ wallet: walletAddress });
    const secureEntries = new Map<string, string>([[oldKey, storedValue]]);
    const secureGet = vi.mocked(SecureStore.getItemAsync);
    const secureSet = vi.mocked(SecureStore.setItemAsync);
    const secureDelete = vi.mocked(SecureStore.deleteItemAsync);
    const validateSecureKey = (key: string) => {
      if (!/^[\w.-]+$/.test(key)) throw new Error(`Invalid SecureStore key: ${key}`);
    };

    secureGet.mockImplementation(async (key) => secureEntries.get(key) ?? null);
    secureSet.mockImplementation(async (key, value) => {
      secureEntries.set(key, value);
    });
    secureDelete.mockImplementation(async (key) => {
      secureEntries.delete(key);
    });

    try {
      await expect(migratingSecureStorage.getItem(storageName)).resolves.toBe(storedValue);
      expect(secureEntries.get(newKey)).toBe(storedValue);
      expect(secureEntries.has(oldKey)).toBe(false);
      expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(oldKey);
    } finally {
      secureGet.mockImplementation(async (key) => {
        validateSecureKey(key);
        return null;
      });
      secureSet.mockImplementation(async (key, value) => {
        validateSecureKey(key);
        if (new TextEncoder().encode(value).length > 2_048) throw new Error("Value too large");
      });
      secureDelete.mockImplementation(async (key) => {
        validateSecureKey(key);
      });
    }
  });

  it("clears legacy plaintext when SecureStore migration fails", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.mocked(SecureStore.getItemAsync).mockResolvedValueOnce(null);
    vi.mocked(AsyncStorage.getItem).mockResolvedValueOnce(
      JSON.stringify({
        state: {
          walletAddress: "0x1234567890123456789012345678901234567890",
          isConnected: true,
          connectionKind: "manual",
        },
        version: 0,
      }),
    );
    vi.mocked(SecureStore.setItemAsync).mockRejectedValueOnce(new Error("Keystore unavailable"));

    await useWalletStore.persist.rehydrate();

    expect(AsyncStorage.removeItem).toHaveBeenCalledWith("wallet-storage");
    expect(useWalletStore.getState().walletAddress).toBeNull();
    expect(consoleError).toHaveBeenCalledWith(
      "Error migrating sensitive data to SecureStore: wallet-storage",
      expect.any(Error),
    );
    consoleError.mockRestore();
  });

  it("migrates legacy session state and clears its AsyncStorage entry", async () => {
    const mockSessionData = JSON.stringify({
      state: {
        status: "authenticated",
        walletAddress: "0x1234567890123456789012345678901234567890",
        token: "legacy-session-token",
        expiresAt: Date.now() + 60_000,
      },
      version: 0,
    });
    vi.mocked(SecureStore.getItemAsync).mockResolvedValueOnce(null);
    vi.mocked(AsyncStorage.getItem).mockResolvedValueOnce(mockSessionData);

    await useSessionStore.persist.rehydrate();

    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      "session-storage",
      mockSessionData,
      expect.objectContaining({
        keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      }),
    );
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith("session-storage");
    expect(useSessionStore.getState()).toMatchObject({
      status: "authenticated",
      walletAddress: "0x1234567890123456789012345678901234567890",
      token: "legacy-session-token",
    });
  });

  it("migrates legacy reconciliation state and clears its AsyncStorage entry", async () => {
    const walletAddress = "0x1234567890123456789012345678901234567890";
    const legacyData = JSON.stringify({
      state: { versions: { [`guild-1::${walletAddress}`]: 7 } },
      version: 0,
    });
    vi.mocked(SecureStore.getItemAsync).mockResolvedValueOnce(null);
    vi.mocked(AsyncStorage.getItem).mockResolvedValueOnce(legacyData);

    await useReconciliationStore.persist.rehydrate();

    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      getSecureStorageKey("guildpass:reconciliation:v1"),
      legacyData,
      expect.any(Object),
    );
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith("guildpass:reconciliation:v1");
    expect(
      useReconciliationStore.getState().getVersion({ guildId: "guild-1", walletAddress }),
    ).toBe(7);
  });

  it("migrates legacy attestation entries and clears their AsyncStorage keys", async () => {
    const walletAddress = "0x1234567890123456789012345678901234567890";
    const legacyKey = `guildpass:attestations:${walletAddress}:guild-1:role-1`;
    const legacyData = JSON.stringify({
      guildId: "guild-1",
      roleId: "role-1",
      wallet: walletAddress,
      issuedAt: 1,
      expiresAt: 2,
      signature: `0x${"a".repeat(130)}`,
      cachedAt: 3,
    });
    vi.mocked(SecureStore.getItemAsync).mockResolvedValueOnce(null);
    vi.mocked(AsyncStorage.getItem).mockResolvedValueOnce(legacyData);

    const attestation = await getCachedAttestation(walletAddress, "guild-1", "role-1");

    expect(attestation?.wallet).toBe(walletAddress);
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      getSecureStorageKey(legacyKey),
      legacyData,
      expect.any(Object),
    );
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith(legacyKey);
  });

  it("should clear all persisted data on resetAppState", async () => {
    await resetAppState();

    expect(useWalletStore.getState().walletAddress).toBe(null);
    expect(useWalletStore.getState().isConnected).toBe(false);
    expect(useSessionStore.getState().status).toBe("unauthenticated");
    expect(useSessionStore.getState().token).toBe(null);

    // Verify storage calls
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith("wallet-storage");
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith("wallet-storage");
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith("session-storage");
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith("sync-storage");
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(
      getSecureStorageKey("guildpass:reconciliation:v1"),
    );
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(
      getSecureStorageKey("guildpass:issuer-keys-index"),
    );
  });

  it("migrates every known legacy key during the first-launch sweep", async () => {
    const walletAddress = "0x1234567890123456789012345678901234567890";
    const legacyEntries = new Map<string, string>([
      ["wallet-storage", JSON.stringify({ state: { walletAddress }, version: 0 })],
      ["session-storage", JSON.stringify({ state: { token: "legacy-token" }, version: 0 })],
      ["sync-storage", JSON.stringify({ state: { entityMeta: { [walletAddress]: {} } } })],
      [
        "guildpass:reconciliation:v1",
        JSON.stringify({ state: { versions: { [walletAddress]: 1 } } }),
      ],
      [
        `guildpass:attestations:${walletAddress}:guild-1:role-1`,
        JSON.stringify({ wallet: walletAddress }),
      ],
      [
        `guildpass:attestation-index${walletAddress}`,
        JSON.stringify([{ guildId: "guild-1", roleId: "role-1" }]),
      ],
      ["guildpass:issuer-keys:guild-1", JSON.stringify({ issuerAddress: walletAddress })],
      ["guildpass:issuer-keys-index", JSON.stringify(["guild-1"])],
      [
        "guildpass:push-notifications:v1",
        JSON.stringify({ state: { pushToken: "ExponentPushToken[legacy-secret]" } }),
      ],
      [
        "guildpass:attestation-key-registry:guild-1",
        JSON.stringify({ guildId: "guild-1", revokedAddresses: [walletAddress] }),
      ],
      ["guildpass:attestation-key-registry-index", JSON.stringify(["guild-1"])],
    ]);
    const asyncGet = vi.mocked(AsyncStorage.getItem);
    const asyncRemove = vi.mocked(AsyncStorage.removeItem);
    const asyncGetAll = vi.mocked(AsyncStorage.getAllKeys);
    const secureGet = vi.mocked(SecureStore.getItemAsync);
    const secureSet = vi.mocked(SecureStore.setItemAsync);
    const secureDelete = vi.mocked(SecureStore.deleteItemAsync);
    const secureEntries = new Map<string, string>();
    const validateSecureKey = (key: string) => {
      if (!/^[\w.-]+$/.test(key)) throw new Error(`Invalid SecureStore key: ${key}`);
    };
    asyncGet.mockImplementation(async (key) => legacyEntries.get(key) ?? null);
    asyncRemove.mockImplementation(async (key) => {
      legacyEntries.delete(key);
    });
    asyncGetAll.mockResolvedValue([...legacyEntries.keys()]);
    secureGet.mockImplementation(async (key) => {
      validateSecureKey(key);
      return secureEntries.get(key) ?? null;
    });
    secureSet.mockImplementation(async (key, value) => {
      validateSecureKey(key);
      if (new TextEncoder().encode(value).length > 2_048) throw new Error("Value too large");
      secureEntries.set(key, value);
    });
    secureDelete.mockImplementation(async (key) => {
      validateSecureKey(key);
      secureEntries.delete(key);
    });

    try {
      const report = await migrateLegacySensitiveStorage();

      expect(report.failedKeys).toEqual([]);
      expect(report.migratedKeys).toHaveLength(11);
      expect(legacyEntries.size).toBe(0);
      for (const [key] of vi.mocked(SecureStore.setItemAsync).mock.calls) {
        expect(key).toMatch(/^[\w.-]+$/);
      }
    } finally {
      asyncGet.mockReset();
      asyncRemove.mockReset();
      asyncGetAll.mockReset();
      secureGet.mockImplementation(async (key) => {
        validateSecureKey(key);
        return null;
      });
      secureSet.mockImplementation(async (key, value) => {
        validateSecureKey(key);
        if (new TextEncoder().encode(value).length > 2_048) throw new Error("Value too large");
      });
      secureDelete.mockImplementation(async (key) => {
        validateSecureKey(key);
      });
    }
  });

  it("reports secure write failures after removing any plaintext fallback", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.mocked(SecureStore.getItemAsync).mockResolvedValueOnce(null);
    vi.mocked(SecureStore.setItemAsync).mockRejectedValueOnce(new Error("Keystore unavailable"));
    vi.mocked(AsyncStorage.getItem).mockResolvedValueOnce(null);

    try {
      await expect(
        migratingSecureStorage.setItem("session-storage", "sensitive-session"),
      ).rejects.toThrow("Keystore unavailable");
      expect(AsyncStorage.removeItem).toHaveBeenCalledWith("session-storage");
    } finally {
      consoleError.mockRestore();
    }
  });

  it("does not hydrate legacy data when AsyncStorage cleanup cannot be verified", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const asyncGet = vi.mocked(AsyncStorage.getItem);
    const asyncRemove = vi.mocked(AsyncStorage.removeItem);
    asyncGet.mockResolvedValue("plaintext-wallet-state");
    asyncRemove.mockRejectedValue(new Error("Filesystem is read-only"));

    try {
      await expect(migratingSecureStorage.getItem("wallet-storage")).resolves.toBeNull();
      expect(asyncRemove).toHaveBeenCalledTimes(3);
      expect(consoleError).toHaveBeenCalledWith(
        "Error clearing legacy sensitive data from AsyncStorage: wallet-storage",
        expect.any(Error),
      );
    } finally {
      asyncGet.mockReset();
      asyncRemove.mockReset();
      consoleError.mockRestore();
    }
  });

  it("chunks SecureStore values so every native write stays below 2048 bytes", async () => {
    const largeValue = JSON.stringify({ walletAddress: "0xabc", data: "x".repeat(6_000) });
    const secureGet = vi.mocked(SecureStore.getItemAsync);
    const secureSet = vi.mocked(SecureStore.setItemAsync);
    const secureDelete = vi.mocked(SecureStore.deleteItemAsync);
    const secureEntries = new Map<string, string>();
    const validateSecureKey = (key: string) => {
      if (!/^[\w.-]+$/.test(key)) throw new Error(`Invalid SecureStore key: ${key}`);
    };
    secureGet.mockImplementation(async (key) => secureEntries.get(key) ?? null);
    secureSet.mockImplementation(async (key, value) => {
      validateSecureKey(key);
      if (new TextEncoder().encode(value).length > 2_048) throw new Error("Value too large");
      secureEntries.set(key, value);
    });
    secureDelete.mockImplementation(async (key) => {
      secureEntries.delete(key);
    });

    try {
      await migratingSecureStorage.setItem("sync-storage", largeValue);
      await expect(migratingSecureStorage.getItem("sync-storage")).resolves.toBe(largeValue);

      const secureWrites = secureSet.mock.calls;
      expect(secureWrites.some(([key]) => key.includes(".chunk."))).toBe(true);
      expect(secureWrites.some(([, value]) => value.startsWith("gp.chunks.v1:"))).toBe(true);
      for (const [key, value] of secureWrites) {
        expect(key).toMatch(/^[\w.-]+$/);
        expect(new TextEncoder().encode(value).length).toBeLessThanOrEqual(2_048);
      }
    } finally {
      secureGet.mockImplementation(async (key) => {
        validateSecureKey(key);
        return null;
      });
      secureSet.mockImplementation(async (key, value) => {
        validateSecureKey(key);
        if (new TextEncoder().encode(value).length > 2_048) throw new Error("Value too large");
      });
      secureDelete.mockImplementation(async (key) => {
        validateSecureKey(key);
      });
    }
  });

  it("should handle storage errors gracefully during rehydration", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.mocked(SecureStore.getItemAsync).mockRejectedValueOnce(new Error("Storage failed"));

    await useWalletStore.persist.rehydrate();

    // Even if storage fails, the app should not crash and should remain in unauthenticated state
    expect(useWalletStore.getState().isConnected).toBe(false);
    expect(consoleError).toHaveBeenCalledWith(
      "Error reading sensitive data from SecureStore: wallet-storage",
      expect.any(Error),
    );
    consoleError.mockRestore();
  });
});
