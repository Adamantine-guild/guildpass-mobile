import React from "react";
import TestRenderer from "react-test-renderer";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { QueryClient, dehydrate } from "@tanstack/react-query";
import {
  createEncryptedAsyncStoragePersister,
  evictUnboundedData,
} from "../src/lib/encryptedPersister";
import { EncryptionService } from "../src/lib/encryptionService";
import { KeyManager } from "../src/lib/keyManager";
import {
  PERSISTED_QUERY_CACHE_KEY,
  MAX_CACHE_AGE_MS,
  MAX_CACHE_SIZE_BYTES,
  formatLastSyncedAt,
} from "../src/lib/offlineCache";
import { StaleDataBanner } from "../src/components/StaleDataBanner";
import {
  useNetworkStore,
  initConnectivityService,
  resetConnectivityServiceForTest,
} from "../src/features/network/connectivityService";
import { useNetworkStatus } from "../src/features/offline/useNetworkStatus";

const { mockNetInfo, netInfoListeners } = vi.hoisted(() => {
  const netInfoListeners = new Set<(state: any) => void>();
  const mockNetInfo = {
    addEventListener: vi.fn((listener) => {
      netInfoListeners.add(listener);
      return () => netInfoListeners.delete(listener);
    }),
    fetch: vi.fn().mockResolvedValue({ isConnected: true, isInternetReachable: true }),
  };
  return { mockNetInfo, netInfoListeners };
});

vi.mock("@react-native-community/netinfo", () => ({
  default: mockNetInfo,
}));

vi.mock("react-native", () => ({
  View: "View",
  Text: "Text",
  TouchableOpacity: "TouchableOpacity",
  ActivityIndicator: "ActivityIndicator",
}));

const FIXED_KEY_HEX = "0123456789abcdef".repeat(4);
function fakeKeyManager(): KeyManager {
  return {
    getOrCreateKey: vi.fn().mockResolvedValue(FIXED_KEY_HEX),
  } as unknown as KeyManager;
}

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

describe("Offline Caching Layer – Requirements & Acceptance Criteria", () => {
  let storage: ReturnType<typeof createMemoryStorage>;
  let encryptionService: EncryptionService;
  let keyManager: KeyManager;

  beforeEach(() => {
    storage = createMemoryStorage();
    encryptionService = new EncryptionService();
    keyManager = fakeKeyManager();
    resetConnectivityServiceForTest();
    useNetworkStore.setState({ isOnline: true, isOffline: false });
  });

  describe("Persister serialization / deserialization", () => {
    it("serializes and deserializes persisted query cache correctly", async () => {
      const persister = createEncryptedAsyncStoragePersister({
        storage,
        key: PERSISTED_QUERY_CACHE_KEY,
        throttleTime: 0,
        encryptionService,
        keyManager,
      });

      const client = new QueryClient();
      client.setQueryData(["membership", "0x123", "guild_1"], {
        id: "guild_1",
        status: "active",
        roles: ["admin"],
      });
      client.setQueryData(["profile", "0x123"], {
        username: "Alice",
        walletAddress: "0x123",
      });

      const persistedClient = {
        timestamp: Date.now(),
        buster: "v1",
        clientState: dehydrate(client),
      };

      await persister.persistClient(persistedClient);
      expect(storage.setItem).toHaveBeenCalledWith(PERSISTED_QUERY_CACHE_KEY, expect.any(String));

      const restored = await persister.restoreClient();
      expect(restored).toBeDefined();
      expect(restored?.timestamp).toBe(persistedClient.timestamp);

      const targetClient = new QueryClient();
      if (restored?.clientState) {
        const memQuery = restored.clientState.queries.find((q) => q.queryKey[0] === "membership");
        const profQuery = restored.clientState.queries.find((q) => q.queryKey[0] === "profile");
        if (memQuery)
          targetClient.setQueryData(["membership", "0x123", "guild_1"], memQuery.state.data);
        if (profQuery) targetClient.setQueryData(["profile", "0x123"], profQuery.state.data);
      }

      expect(targetClient.getQueryData(["membership", "0x123", "guild_1"])).toEqual({
        id: "guild_1",
        status: "active",
        roles: ["admin"],
      });
      expect(targetClient.getQueryData(["profile", "0x123"])).toEqual({
        username: "Alice",
        walletAddress: "0x123",
      });
    });
  });

  describe("Max age eviction", () => {
    it("evicts queries that exceed max age threshold during serialization", () => {
      const now = Date.now();
      const maxAge = 1000 * 60 * 60; // 1 hour

      const freshQuery = {
        queryKey: ["membership", "0x123", "guild_fresh"],
        state: { data: { id: "fresh" }, dataUpdatedAt: now - 1000 },
      };
      const expiredQuery = {
        queryKey: ["membership", "0x123", "guild_old"],
        state: { data: { id: "old" }, dataUpdatedAt: now - (maxAge + 5000) },
      };

      const client = {
        timestamp: now,
        buster: "v1",
        clientState: {
          queries: [freshQuery, expiredQuery],
          mutations: [],
        },
      };

      const pruned = evictUnboundedData(client as any, maxAge, MAX_CACHE_SIZE_BYTES);
      expect(pruned.clientState.queries).toHaveLength(1);
      expect(pruned.clientState.queries[0].queryKey).toEqual([
        "membership",
        "0x123",
        "guild_fresh",
      ]);
    });

    it("evicts whole cache during deserialization if client timestamp exceeds max age", async () => {
      const maxAge = 1000 * 60; // 1 min
      const persister = createEncryptedAsyncStoragePersister({
        storage,
        key: PERSISTED_QUERY_CACHE_KEY,
        throttleTime: 0,
        encryptionService,
        keyManager,
        maxAge,
      });

      const now = Date.now();
      const expiredClient = {
        timestamp: now - (maxAge + 10000),
        buster: "v1",
        clientState: { queries: [], mutations: [] },
      };

      await persister.persistClient(expiredClient);

      const restored = await persister.restoreClient();
      expect(restored).toBeUndefined();
    });
  });

  describe("Max size eviction", () => {
    it("evicts oldest queries when payload size exceeds max size limit", () => {
      const now = Date.now();
      const queries = Array.from({ length: 10 }, (_, i) => ({
        queryKey: ["membership", "0x123", `guild_${i}`],
        state: {
          data: { id: `guild_${i}`, payload: "X".repeat(200) },
          dataUpdatedAt: now - (10 - i) * 10000,
        },
      }));

      const client = {
        timestamp: now,
        buster: "v1",
        clientState: {
          queries,
          mutations: [],
        },
      };

      const pruned = evictUnboundedData(client as any, MAX_CACHE_AGE_MS, 800);
      expect(JSON.stringify(pruned).length).toBeLessThanOrEqual(800);
      expect(pruned.clientState.queries.length).toBeLessThan(10);
      const remainingIds = pruned.clientState.queries.map((q: any) => q.queryKey[2]);
      expect(remainingIds).toContain("guild_9");
    });
  });

  describe("Offline banner rendering when NetInfo reports offline", () => {
    function NetworkSubscriberComponent() {
      const { isOffline } = useNetworkStatus();
      if (!isOffline) return null;
      return <StaleDataBanner reason="offline" lastSyncedAt={new Date(1700000000000)} />;
    }

    it("renders the offline staleness banner when NetInfo reports offline state", async () => {
      initConnectivityService();
      const listener = mockNetInfo.addEventListener.mock.calls[0][0];

      // Simulate NetInfo going offline
      await listener({ isConnected: false, isInternetReachable: false });

      const renderer = TestRenderer.create(<NetworkSubscriberComponent />);
      const json = JSON.stringify(renderer.toJSON());

      expect(json).toContain("stale-data-banner");
      expect(json).toContain("offline — showing cached data");
    });
  });

  describe("'Last synced' timestamp display", () => {
    it("displays the last synced timestamp formatted on the banner", () => {
      const syncedDate = new Date(1700000000000);
      const renderer = TestRenderer.create(
        <StaleDataBanner reason="offline" lastSyncedAt={syncedDate} />,
      );

      const json = JSON.stringify(renderer.toJSON());
      expect(json).toContain("stale-banner-last-synced");
      expect(json).toContain("Last synced at");
      expect(json).toContain(formatLastSyncedAt(syncedDate.getTime())!);
    });
  });
});
