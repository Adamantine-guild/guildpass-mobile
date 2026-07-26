/**
 * Offline cache – persistence, stale state, and wallet-scoped separation
 */

import { beforeEach, describe, expect, it } from "vitest";
import { QueryClient, dehydrate, hydrate } from "@tanstack/react-query";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import {
  isPersistableQuery,
  PERSISTED_QUERY_CACHE_KEY,
  QUERY_STALE_TIME_MS,
} from "../src/lib/offlineCache";
import { getStaleQueryState } from "../src/lib/staleQueryState";
import { TEST_WALLET_ADDRESS, NON_MEMBER_WALLET_ADDRESS } from "./fixtures/membership.fixtures";
import { GUILD_DETAIL_FIXTURE } from "./fixtures/guild.fixtures";
import { MEMBERSHIP_ACTIVE_FIXTURE } from "./fixtures/membership.fixtures";

function createMemoryStorage() {
  const store = new Map<string, string>();

  return {
    getItem: async (key: string) => store.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: async (key: string) => {
      store.delete(key);
    },
    snapshot: () => new Map(store),
  };
}

describe("offline cache – persistable query keys", () => {
  it("allows membership, guild, role, and access queries to be persisted", () => {
    expect(isPersistableQuery(["membership", TEST_WALLET_ADDRESS, "guild_abc"])).toBe(true);
    expect(isPersistableQuery(["user-roles", TEST_WALLET_ADDRESS, "guild_abc"])).toBe(true);
    expect(isPersistableQuery(["guild", "guild_abc"])).toBe(true);
    expect(isPersistableQuery(["guild-config", "guild_abc"])).toBe(true);
    expect(isPersistableQuery(["guild-roles", "guild_abc"])).toBe(true);
    expect(isPersistableQuery(["access-check", { walletAddress: TEST_WALLET_ADDRESS }])).toBe(true);
  });

  it("does not persist unknown or sensitive query namespaces", () => {
    expect(isPersistableQuery(["wallet-secret", TEST_WALLET_ADDRESS])).toBe(false);
    expect(isPersistableQuery(["auth-token"])).toBe(false);
  });
});

describe("offline cache – wallet-scoped cache separation", () => {
  it("stores membership data under wallet-specific query keys", async () => {
    const queryClient = new QueryClient();
    const walletAKey = ["membership", TEST_WALLET_ADDRESS, "guild_abc"] as const;
    const walletBKey = ["membership", NON_MEMBER_WALLET_ADDRESS, "guild_abc"] as const;

    queryClient.setQueryData(walletAKey, MEMBERSHIP_ACTIVE_FIXTURE);
    queryClient.setQueryData(walletBKey, {
      ...MEMBERSHIP_ACTIVE_FIXTURE,
      walletAddress: NON_MEMBER_WALLET_ADDRESS,
      isActive: false,
    });

    const walletAData = queryClient.getQueryData(walletAKey) as {
      walletAddress: string;
      isActive: boolean;
    };
    const walletBData = queryClient.getQueryData(walletBKey) as {
      walletAddress: string;
      isActive: boolean;
    };

    expect(walletAData.walletAddress).toBe(TEST_WALLET_ADDRESS);
    expect(walletBData.walletAddress).toBe(NON_MEMBER_WALLET_ADDRESS);
    expect(walletAData).not.toEqual(walletBData);
  });
});

describe("offline cache – restore after restart", () => {
  let storage: ReturnType<typeof createMemoryStorage>;
  let persister: ReturnType<typeof createAsyncStoragePersister>;

  beforeEach(() => {
    storage = createMemoryStorage();
    persister = createAsyncStoragePersister({
      storage,
      key: PERSISTED_QUERY_CACHE_KEY,
      throttleTime: 0,
    });
  });

  it("restores dehydrated guild and membership data into a new query client", async () => {
    const sourceClient = new QueryClient();
    const guildKey = ["guild", "guild_abc"] as const;
    const membershipKey = ["membership", TEST_WALLET_ADDRESS, "guild_abc"] as const;

    sourceClient.setQueryData(guildKey, GUILD_DETAIL_FIXTURE);
    sourceClient.setQueryData(membershipKey, MEMBERSHIP_ACTIVE_FIXTURE);

    await persister.persistClient({
      timestamp: Date.now(),
      buster: "",
      clientState: dehydrate(sourceClient, {
        shouldDehydrateQuery: (query) =>
          query.state.status === "success" && isPersistableQuery(query.queryKey),
      }),
    });

    const restoredClient = new QueryClient();
    const persisted = await persister.restoreClient();
    expect(persisted).not.toBeUndefined();

    hydrate(restoredClient, persisted!.clientState);

    expect(restoredClient.getQueryData(guildKey)).toStrictEqual(GUILD_DETAIL_FIXTURE);
    expect(restoredClient.getQueryData(membershipKey)).toStrictEqual(MEMBERSHIP_ACTIVE_FIXTURE);
  });

  it("clears persisted cache when removeClient is called", async () => {
    const sourceClient = new QueryClient();
    sourceClient.setQueryData(["guild", "guild_abc"], GUILD_DETAIL_FIXTURE);

    await persister.persistClient({
      timestamp: Date.now(),
      buster: "",
      clientState: dehydrate(sourceClient),
    });

    await persister.removeClient();

    expect(await storage.getItem(PERSISTED_QUERY_CACHE_KEY)).toBeNull();
    expect(await persister.restoreClient()).toBeUndefined();
  });
});

describe("offline cache – stale state", () => {
  it("marks cached data stale when the device is offline", () => {
    const state = getStaleQueryState(
      {
        data: MEMBERSHIP_ACTIVE_FIXTURE,
        dataUpdatedAt: Date.now(),
        isStale: false,
      },
      true,
    );

    expect(state.isStale).toBe(true);
    expect(state.reason).toBe("offline");
  });

  it("marks cached data stale when it is older than the freshness window", () => {
    const state = getStaleQueryState(
      {
        data: MEMBERSHIP_ACTIVE_FIXTURE,
        dataUpdatedAt: Date.now() - QUERY_STALE_TIME_MS - 1,
        isStale: true,
      },
      false,
    );

    expect(state.isStale).toBe(true);
    expect(state.reason).toBe("expired");
  });

  it("does not mark fresh online data as stale", () => {
    const state = getStaleQueryState(
      {
        data: MEMBERSHIP_ACTIVE_FIXTURE,
        dataUpdatedAt: Date.now(),
        isStale: false,
      },
      false,
    );

    expect(state.isStale).toBe(false);
    expect(state.reason).toBeNull();
  });
});

describe("offline cache – offline failures keep last known data", () => {
  it("retains previously cached guild data after a failed refetch", async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          staleTime: 0,
          networkMode: "offlineFirst",
        },
      },
    });

    const guildKey = ["guild", "guild_abc"] as const;
    queryClient.setQueryData(guildKey, GUILD_DETAIL_FIXTURE);

    await expect(
      queryClient.fetchQuery({
        queryKey: guildKey,
        queryFn: async () => {
          throw new Error("Network request failed");
        },
      }),
    ).rejects.toThrow("Network request failed");

    expect(queryClient.getQueryData(guildKey)).toStrictEqual(GUILD_DETAIL_FIXTURE);
  });
});
