import { describe, expect, it, vi } from "vitest";

vi.mock("@guildpass/sdk", async () => {
  // @ts-expect-error Vitest runs this async mock factory through Vite.
  const { mockSdkModule } = await import("../fixtures/sdk.mock");
  return mockSdkModule();
});
vi.mock("expo-constants", () => ({
  default: { expoConfig: { extra: { apiUrl: "https://api.guildpass.test", chainId: 1 } } },
}));

import {
  buildGuildQueryOptions,
  buildGuildConfigQueryOptions,
  buildMembershipQueryOptions,
  buildRolesQueryOptions,
  buildUserRolesQueryOptions,
  guildQueryKeys,
  membershipQueryKeys,
} from "../../src/lib/queryPolicies";

describe("query policy configuration", () => {
  it("uses a long stale time for guild metadata and config", () => {
    const guildOptions = buildGuildQueryOptions("guild_123");
    const configOptions = buildGuildConfigQueryOptions("guild_123");

    expect(guildQueryKeys.detail("guild_123")).toEqual(["guild", "guild_123"]);
    expect(configOptions.staleTime).toBe(1000 * 60 * 5);
    expect(guildOptions.staleTime).toBe(1000 * 60 * 5);
  });

  it("uses a shorter stale time for volatile role and membership data", () => {
    const rolesOptions = buildRolesQueryOptions("guild_123");
    const membershipOptions = buildMembershipQueryOptions("wallet_123", "guild_123");
    const userRolesOptions = buildUserRolesQueryOptions("wallet_123", "guild_123");

    expect(membershipQueryKeys.detail("wallet_123", "guild_123")).toEqual([
      "membership",
      "wallet_123",
      "guild_123",
    ]);
    expect(rolesOptions.staleTime).toBe(1000 * 30);
    expect(membershipOptions.staleTime).toBe(1000 * 30);
    expect(userRolesOptions.staleTime).toBe(1000 * 30);
  });
});
