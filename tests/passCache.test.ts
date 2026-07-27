import { describe, expect, it } from "vitest";
import { QueryClient, dehydrate, hydrate } from "@tanstack/react-query";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import {
  getCachedMembershipSummaries,
  rebuildMembershipsAggregateFromCache,
  resolveGuildPassStatus,
} from "../src/features/passes/passCache";
import { isPersistableQuery, PERSISTED_QUERY_CACHE_KEY } from "../src/lib/offlineCache";
import { queryKeys } from "../src/lib/queryKeys";
import {
  MEMBERSHIP_ACTIVE_FIXTURE,
  TEST_WALLET_ADDRESS,
  USER_ROLES_FIXTURE,
} from "./fixtures/membership.fixtures";

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
  };
}

describe("pass cache", () => {
  it("restores a persisted wallet pass list after an app restart", async () => {
    const storage = createMemoryStorage();
    const persister = createAsyncStoragePersister({
      storage,
      key: PERSISTED_QUERY_CACHE_KEY,
      throttleTime: 0,
    });
    const sourceClient = new QueryClient();
    const membershipsKey = queryKeys.memberships.byWallet(TEST_WALLET_ADDRESS);

    sourceClient.setQueryData(membershipsKey, [
      {
        guildId: "guild_abc",
        isActive: true,
        roleCount: 2,
        status: "active",
      },
    ]);

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
    expect(persisted).toBeDefined();
    hydrate(restoredClient, persisted!.clientState);

    expect(getCachedMembershipSummaries(restoredClient, TEST_WALLET_ADDRESS)).toStrictEqual([
      {
        guildId: "guild_abc",
        isActive: true,
        roleCount: 2,
        status: "active",
        lastSyncedAt: expect.any(Number),
      },
    ]);
  });

  it("rebuilds the aggregate pass list from refreshed membership and role entities", () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(queryKeys.memberships.byWallet(TEST_WALLET_ADDRESS), [
      {
        guildId: "guild_abc",
        isActive: true,
        roleCount: 2,
        status: "active",
      },
    ]);
    queryClient.setQueryData(
      queryKeys.membership.byWalletAndGuild(TEST_WALLET_ADDRESS, "guild_abc"),
      {
        ...MEMBERSHIP_ACTIVE_FIXTURE,
        status: "revoked",
        isActive: false,
      },
    );
    queryClient.setQueryData(
      queryKeys.userRoles.byWalletAndGuild(TEST_WALLET_ADDRESS, "guild_abc"),
      [],
    );

    const summaries = rebuildMembershipsAggregateFromCache(queryClient, TEST_WALLET_ADDRESS);

    expect(summaries).toStrictEqual([
      {
        guildId: "guild_abc",
        isActive: false,
        roleCount: 0,
        status: "revoked",
        lastSyncedAt: expect.any(Number),
      },
    ]);
    expect(
      queryClient.getQueryData(queryKeys.memberships.byWallet(TEST_WALLET_ADDRESS)),
    ).toStrictEqual(summaries);
  });

  it("classifies expired and revoked cached passes distinctly", () => {
    expect(resolveGuildPassStatus({ ...MEMBERSHIP_ACTIVE_FIXTURE, status: "revoked" })).toBe(
      "revoked",
    );
    expect(
      resolveGuildPassStatus({
        ...MEMBERSHIP_ACTIVE_FIXTURE,
        expiresAt: "2020-01-01T00:00:00.000Z",
      }),
    ).toBe("expired");
    expect(resolveGuildPassStatus(MEMBERSHIP_ACTIVE_FIXTURE)).toBe("active");
    expect(USER_ROLES_FIXTURE).toHaveLength(2);
  });
});
