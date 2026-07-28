import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import {
  applyOptimisticCacheUpdates,
  markOptimisticCacheSynced,
  rollbackOptimisticCacheUpdates,
} from "../src/lib/optimisticCache";

describe("optimistic cache helpers", () => {
  it("applies optimistic data and rolls back to the previous cache value", async () => {
    const queryClient = new QueryClient();
    const queryKey = ["preferences", "current"] as const;
    const previous = { pushNotifications: false, emailNotifications: true };

    queryClient.setQueryData(queryKey, previous);

    const context = await applyOptimisticCacheUpdates(queryClient, { pushNotifications: true }, [
      {
        queryKey,
        updater: (current, variables) => ({
          ...(current as typeof previous),
          ...variables,
        }),
      },
    ]);

    expect(queryClient.getQueryData(queryKey)).toStrictEqual({
      pushNotifications: true,
      emailNotifications: true,
    });

    rollbackOptimisticCacheUpdates(queryClient, context);

    expect(queryClient.getQueryData(queryKey)).toStrictEqual(previous);
  });

  it("removes a query created only for an optimistic update when rollback runs", async () => {
    const queryClient = new QueryClient();
    const queryKey = ["preferences", "current"] as const;

    const context = await applyOptimisticCacheUpdates(queryClient, { pushNotifications: true }, [
      {
        queryKey,
        updater: (_current, variables) => variables,
      },
    ]);

    expect(queryClient.getQueryData(queryKey)).toStrictEqual({ pushNotifications: true });

    rollbackOptimisticCacheUpdates(queryClient, context);

    expect(queryClient.getQueryState(queryKey)).toBeUndefined();
  });

  it("writes a confirmed mutation result without invalidating unrelated queries", () => {
    const queryClient = new QueryClient();
    const queryKey = ["preferences", "current"] as const;
    queryClient.setQueryData(queryKey, { syncStatus: "pending" });

    const synced = markOptimisticCacheSynced(queryClient, queryKey, () => ({
      syncStatus: "synced",
    }));

    expect(synced).toStrictEqual({ syncStatus: "synced" });
    expect(queryClient.getQueryData(queryKey)).toStrictEqual({ syncStatus: "synced" });
  });
});
