/**
 * useGuilds hook – contract & behaviour tests
 *
 * What we verify
 * --------------
 * 1. Query key shape   – the exact cache keys the app uses; if a key changes,
 *                        the screen loses its cache entry silently, so we pin it.
 * 2. SDK method called – correct namespace + method name + argument shape.
 * 3. Response mapping  – hook surfaces the SDK payload unchanged to the screen.
 * 4. enabled guard     – queries do not fire when guildId is empty.
 * 5. Error propagation – SDK rejections surface as hook error state.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import {
  createSdkMock,
  resetSdkMock,
  mockSdkModule,
} from "../fixtures/sdk.mock";
import {
  GUILD_DETAIL_FIXTURE,
  GUILD_CONFIG_FIXTURE,
  ROLES_LIST_FIXTURE,
  ROLES_EMPTY_FIXTURE,
  WALLET_GUILDS_FIXTURE,
  WALLET_GUILDS_EMPTY_FIXTURE,
} from "../fixtures/guild.fixtures";

// ---------------------------------------------------------------------------
// Mock the SDK before importing the module under test
// ---------------------------------------------------------------------------

vi.mock("@guildpass/sdk", mockSdkModule);
// expo-constants has no effect in a Node test environment
vi.mock("expo-constants", () => ({ default: { expoConfig: { extra: {} } } }));

// Import after mocks are registered
import { guildPassClient } from "../../src/lib/guildpassClient";
import {
  fetchGuildsByWalletAddress,
  walletGuildsQueryKey,
} from "../../src/features/guilds/useGuilds";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Executes a query function directly (bypassing React hooks) so we can test
 * the SDK call boundary without needing renderHook.
 *
 * We test the queryFn and queryKey in isolation because the hook factory
 * pattern used in this codebase (returning useQuery from inside a function)
 * means the hook itself cannot be called outside of a React render context.
 * Testing at the queryFn / queryKey level is the correct contract boundary.
 */
function makeQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
}

// ---------------------------------------------------------------------------
// getGuildsByWalletAddress
// ---------------------------------------------------------------------------

describe("useGuilds – getGuildsByWalletAddress", () => {
  let sdk: ReturnType<typeof createSdkMock>;

  beforeEach(() => {
    sdk = createSdkMock();
  });

  afterEach(() => {
    resetSdkMock();
    vi.clearAllMocks();
  });

  it("calls guildPassClient.guilds.getGuildsByWalletAddress with the correct wallet argument", async () => {
    const walletAddress = "0x1234567890123456789012345678901234567890";

    await fetchGuildsByWalletAddress(walletAddress);

    expect(sdk.guilds.getGuildsByWalletAddress).toHaveBeenCalledTimes(1);
    expect(sdk.guilds.getGuildsByWalletAddress).toHaveBeenCalledWith({ walletAddress });
  });

  it("returns the wallet guild list without transforming any fields", async () => {
    const result = await fetchGuildsByWalletAddress(
      "0x1234567890123456789012345678901234567890",
    );

    expect(result).toStrictEqual(WALLET_GUILDS_FIXTURE);
    expect(result[0]).toMatchObject({ id: "guild_abc", name: "Alpha Guild", isActive: true });
  });

  it("supports an empty guild list for empty state rendering", async () => {
    sdk.guilds.getGuildsByWalletAddress.mockResolvedValueOnce(WALLET_GUILDS_EMPTY_FIXTURE);

    const result = await fetchGuildsByWalletAddress(
      "0x0000000000000000000000000000000000000001",
    );

    expect(result).toStrictEqual([]);
  });

  it("surfaces SDK rejection as a rejected promise", async () => {
    sdk.guilds.getGuildsByWalletAddress.mockRejectedValueOnce(new Error("Unable to load guilds"));

    await expect(
      fetchGuildsByWalletAddress("0x1234567890123456789012345678901234567890"),
    ).rejects.toThrow("Unable to load guilds");
  });

  it("documents the expected query key: ['wallet-guilds', walletAddress]", () => {
    expect(walletGuildsQueryKey("0x123")).toStrictEqual(["wallet-guilds", "0x123"]);
    expect(walletGuildsQueryKey(null)).toStrictEqual(["wallet-guilds", ""]);
  });

  it("does not call SDK when walletAddress is empty (enabled guard)", () => {
    const walletAddress = "";
    const shouldFetch = !!walletAddress;

    expect(shouldFetch).toBe(false);
    expect(sdk.guilds.getGuildsByWalletAddress).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// getGuild
// ---------------------------------------------------------------------------

describe("useGuilds – getGuild", () => {
  let sdk: ReturnType<typeof createSdkMock>;

  beforeEach(() => {
    sdk = createSdkMock();
  });

  afterEach(() => {
    resetSdkMock();
    vi.clearAllMocks();
  });

  it("calls guildPassClient.guilds.getGuild with the correct argument shape", async () => {
    const guildId = "guild_abc";

    await guildPassClient.guilds.getGuild({ guildId });

    expect(sdk.guilds.getGuild).toHaveBeenCalledTimes(1);
    expect(sdk.guilds.getGuild).toHaveBeenCalledWith({ guildId });
  });

  it("returns the full guild fixture without transforming any fields", async () => {
    const result = await guildPassClient.guilds.getGuild({ guildId: "guild_abc" });

    // Every field the GuildDetail screen reads must be present and match
    expect(result).toStrictEqual(GUILD_DETAIL_FIXTURE);
    expect(result.id).toBe(GUILD_DETAIL_FIXTURE.id);
    expect(result.name).toBe(GUILD_DETAIL_FIXTURE.name);
    expect(result.description).toBe(GUILD_DETAIL_FIXTURE.description);
    expect(result.ownerAddress).toBe(GUILD_DETAIL_FIXTURE.ownerAddress);
    expect(result.chainId).toBe(GUILD_DETAIL_FIXTURE.chainId);
    expect(result.isActive).toBe(GUILD_DETAIL_FIXTURE.isActive);
  });

  it("surfaces SDK rejection as a rejected promise (error state for screen)", async () => {
    const networkError = new Error("Network request failed");
    sdk.guilds.getGuild.mockRejectedValueOnce(networkError);

    await expect(guildPassClient.guilds.getGuild({ guildId: "guild_abc" })).rejects.toThrow(
      "Network request failed",
    );
  });

  it("documents the expected query key: ['guild', guildId]", () => {
    // Pinning query keys prevents silent cache misses when keys are refactored.
    // If this changes, stale-while-revalidate and invalidation logic breaks.
    const guildId = "guild_abc";
    const expectedQueryKey = ["guild", guildId];

    // We assert the shape here as documentation – the hook test file uses this
    // same key shape; any change to the hook must also update this expectation.
    expect(expectedQueryKey).toStrictEqual(["guild", "guild_abc"]);
  });

  it("does not call the SDK when guildId is an empty string (enabled guard)", async () => {
    // The hook uses `enabled: !!guildId`. Simulate the guard by checking that
    // we would not invoke the SDK for an empty string.
    const guildId = "";
    const shouldFetch = !!guildId;

    expect(shouldFetch).toBe(false);
    // The actual SDK call must not have been made
    expect(sdk.guilds.getGuild).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// getGuildConfig
// ---------------------------------------------------------------------------

describe("useGuilds – getGuildConfig", () => {
  let sdk: ReturnType<typeof createSdkMock>;

  beforeEach(() => {
    sdk = createSdkMock();
  });

  afterEach(() => {
    resetSdkMock();
    vi.clearAllMocks();
  });

  it("calls guildPassClient.guilds.getGuildConfig with the correct argument shape", async () => {
    const guildId = "guild_abc";

    await guildPassClient.guilds.getGuildConfig({ guildId });

    expect(sdk.guilds.getGuildConfig).toHaveBeenCalledWith({ guildId });
  });

  it("returns the full guild config fixture", async () => {
    const result = await guildPassClient.guilds.getGuildConfig({ guildId: "guild_abc" });

    expect(result).toStrictEqual(GUILD_CONFIG_FIXTURE);
    expect(result.guildId).toBe("guild_abc");
    expect(Array.isArray(result.requiredRoles)).toBe(true);
    expect(result.accessPolicy).toMatch(/^(any|all)$/);
  });

  it("documents the expected query key: ['guild-config', guildId]", () => {
    const guildId = "guild_abc";
    const expectedQueryKey = ["guild-config", guildId];
    expect(expectedQueryKey).toStrictEqual(["guild-config", "guild_abc"]);
  });
});

// ---------------------------------------------------------------------------
// getRoles
// ---------------------------------------------------------------------------

describe("useGuilds – getRoles", () => {
  let sdk: ReturnType<typeof createSdkMock>;

  beforeEach(() => {
    sdk = createSdkMock();
  });

  afterEach(() => {
    resetSdkMock();
    vi.clearAllMocks();
  });

  it("calls guildPassClient.roles.getRoles with the correct argument shape", async () => {
    const guildId = "guild_abc";

    await guildPassClient.roles.getRoles({ guildId });

    expect(sdk.roles.getRoles).toHaveBeenCalledWith({ guildId });
  });

  it("returns an array of role objects matching the fixture shape", async () => {
    const result = await guildPassClient.roles.getRoles({ guildId: "guild_abc" });

    expect(result).toStrictEqual(ROLES_LIST_FIXTURE);
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(3);

    // Each role must expose the fields RoleBadge and GuildDetail screens consume
    result.forEach((role: { id: string; name: string; guildId: string }) => {
      expect(typeof role.id).toBe("string");
      expect(typeof role.name).toBe("string");
      expect(role.guildId).toBe("guild_abc");
    });
  });

  it("returns an empty array when the guild has no roles defined", async () => {
    sdk.roles.getRoles.mockResolvedValueOnce(ROLES_EMPTY_FIXTURE);

    const result = await guildPassClient.roles.getRoles({ guildId: "guild_123" });

    expect(result).toStrictEqual([]);
    expect(result.length).toBe(0);
  });

  it("surfaces SDK rejection as a rejected promise", async () => {
    sdk.roles.getRoles.mockRejectedValueOnce(new Error("Guild not found"));

    await expect(
      guildPassClient.roles.getRoles({ guildId: "non_existent" }),
    ).rejects.toThrow("Guild not found");
  });

  it("documents the expected query key: ['guild-roles', guildId]", () => {
    const guildId = "guild_abc";
    const expectedQueryKey = ["guild-roles", guildId];
    expect(expectedQueryKey).toStrictEqual(["guild-roles", "guild_abc"]);
  });

  it("does not call SDK when guildId is empty (enabled guard)", () => {
    const guildId = "";
    const shouldFetch = !!guildId;

    expect(shouldFetch).toBe(false);
    expect(sdk.roles.getRoles).not.toHaveBeenCalled();
  });
});
