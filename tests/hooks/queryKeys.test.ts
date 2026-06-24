/**
 * queryKeys – shared query key helper tests
 */

import { describe, it, expect } from "vitest";
import {
  accessCheckKeys,
  guildKeys,
  membershipKeys,
} from "../../src/lib/queryKeys";
import { TEST_WALLET_ADDRESS } from "../fixtures/membership.fixtures";

describe("queryKeys", () => {
  it("creates stable guild query keys", () => {
    expect(guildKeys.detail("guild_abc")).toStrictEqual(["guild", "guild_abc"]);
    expect(guildKeys.config("guild_abc")).toStrictEqual(["guild-config", "guild_abc"]);
    expect(guildKeys.roles("guild_abc")).toStrictEqual(["guild-roles", "guild_abc"]);
  });

  it("creates wallet-scoped membership query keys", () => {
    expect(membershipKeys.detail(TEST_WALLET_ADDRESS, "guild_abc")).toStrictEqual([
      "membership",
      TEST_WALLET_ADDRESS,
      "guild_abc",
    ]);
    expect(membershipKeys.userRoles(TEST_WALLET_ADDRESS, "guild_abc")).toStrictEqual([
      "user-roles",
      TEST_WALLET_ADDRESS,
      "guild_abc",
    ]);
  });

  it("creates access-check query keys from params", () => {
    const params = {
      walletAddress: TEST_WALLET_ADDRESS,
      guildId: "guild_abc",
      resourceId: "secret-channel",
    };

    expect(accessCheckKeys.detail(params)).toStrictEqual(["access-check", params]);
  });
});
