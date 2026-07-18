import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { clearWalletScopedCache } from "../src/lib/walletScopedCache";

describe("clearWalletScopedCache", () => {
  it("removes wallet-scoped membership, role, and access-check cache only", async () => {
    const client = new QueryClient();
    const accessCheck = vi.fn().mockResolvedValue({ hasAccess: true });

    client.setQueryData(["membership", "0xaaa", "guild_1"], { isActive: true });
    client.setQueryData(["user-roles", "0xaaa", "guild_1"], [{ id: "admin" }]);
    client.setQueryData(["guild", "guild_1"], { name: "Alpha Guild" });
    client.setQueryData(["guild-roles", "guild_1"], [{ id: "member" }]);

    const mutation = client.getMutationCache().build(client, {
      mutationKey: ["access-check"],
      mutationFn: accessCheck,
    });
    await mutation.execute(undefined);

    expect(client.getQueryData(["membership", "0xaaa", "guild_1"])).toBeDefined();
    expect(client.getMutationCache().findAll({ mutationKey: ["access-check"] })).toHaveLength(1);

    clearWalletScopedCache(client);

    expect(client.getQueryData(["membership", "0xaaa", "guild_1"])).toBeUndefined();
    expect(client.getQueryData(["user-roles", "0xaaa", "guild_1"])).toBeUndefined();
    expect(client.getMutationCache().findAll({ mutationKey: ["access-check"] })).toHaveLength(0);
    expect(client.getQueryData(["guild", "guild_1"])).toStrictEqual({ name: "Alpha Guild" });
    expect(client.getQueryData(["guild-roles", "guild_1"])).toStrictEqual([{ id: "member" }]);
  });
});
