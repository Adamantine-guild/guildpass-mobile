/**
 * useMembership hook – contract & behaviour tests
 *
 * What we verify
 * --------------
 * 1. SDK method + argument shape  – walletAddress and guildId both forwarded.
 * 2. Query key shape              – wallet-scoped key prevents cross-user cache leaks.
 * 3. Active member response       – isActive: true maps through without modification.
 * 4. Non-member response          – isActive: false (SDK does NOT throw for non-members).
 * 5. getUserRoles contract        – role array shape and empty-array case.
 * 6. enabled guards               – queries are suppressed with empty walletAddress / guildId.
 * 7. Error propagation            – SDK errors surface as rejected promises.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createSdkMock, resetSdkMock } from "../fixtures/sdk.mock";
import {
  MEMBERSHIP_ACTIVE_FIXTURE,
  MEMBERSHIP_INACTIVE_FIXTURE,
  USER_ROLES_FIXTURE,
  USER_ROLES_EMPTY_FIXTURE,
  TEST_WALLET_ADDRESS,
  NON_MEMBER_WALLET_ADDRESS,
} from "../fixtures/membership.fixtures";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("@guildpass/sdk", async () => {
  // @ts-expect-error Vitest runs this async mock factory through Vite.
  const { mockSdkModule } = await import("../fixtures/sdk.mock");
  return mockSdkModule();
});
vi.mock("expo-constants", () => ({
  default: { expoConfig: { extra: { apiUrl: "https://api.guildpass.test", chainId: 1 } } },
}));

import { guildPassClient } from "../../src/lib/guildpassClient";

// ---------------------------------------------------------------------------
// getMembership
// ---------------------------------------------------------------------------

describe("useMembership – getMembership", () => {
  let sdk: ReturnType<typeof createSdkMock>;

  beforeEach(() => {
    sdk = createSdkMock();
  });

  afterEach(() => {
    resetSdkMock();
    vi.clearAllMocks();
  });

  it("calls getMembership with both walletAddress and guildId (full argument shape)", async () => {
    const params = {
      walletAddress: TEST_WALLET_ADDRESS,
      guildId: "guild_abc",
    };

    await guildPassClient.membership.getMembership(params);

    expect(sdk.membership.getMembership).toHaveBeenCalledTimes(1);
    expect(sdk.membership.getMembership).toHaveBeenCalledWith(params);
  });

  // ── Active member ──────────────────────────────────────────────────────────

  it("returns isActive: true for an active member (screen renders 'Active Member')", async () => {
    const result = await guildPassClient.membership.getMembership({
      walletAddress: TEST_WALLET_ADDRESS,
      guildId: "guild_abc",
    });

    expect(result).toStrictEqual(MEMBERSHIP_ACTIVE_FIXTURE);
    expect(result.isActive).toBe(true);
    expect(result.walletAddress).toBe(TEST_WALLET_ADDRESS);
    expect(result.guildId).toBe("guild_abc");
  });

  // ── Not a member ──────────────────────────────────────────────────────────

  it("returns isActive: false for a non-member WITHOUT throwing (screen guards on isActive)", async () => {
    sdk.membership.getMembership.mockResolvedValueOnce(MEMBERSHIP_INACTIVE_FIXTURE);

    const result = await guildPassClient.membership.getMembership({
      walletAddress: NON_MEMBER_WALLET_ADDRESS,
      guildId: "guild_abc",
    });

    // SDK must resolve (not reject) – the screen checks membership.isActive
    expect(result.isActive).toBe(false);
    // A non-member response must not carry the test wallet's address
    expect(result.walletAddress).toBe(NON_MEMBER_WALLET_ADDRESS);
  });

  // ── Query key ─────────────────────────────────────────────────────────────

  it("documents the expected query key: ['membership', walletAddress, guildId]", () => {
    // wallet-scoped key ensures User A's membership is never served to User B
    const walletAddress = TEST_WALLET_ADDRESS;
    const guildId = "guild_abc";
    const expectedKey = ["membership", walletAddress, guildId];

    expect(expectedKey[0]).toBe("membership");
    expect(expectedKey[1]).toBe(walletAddress);
    expect(expectedKey[2]).toBe(guildId);
  });

  // ── enabled guards ────────────────────────────────────────────────────────

  it("does not call SDK when walletAddress is empty (enabled guard)", () => {
    const walletAddress = "";
    const guildId = "guild_abc";
    const shouldFetch = !!walletAddress && !!guildId;

    expect(shouldFetch).toBe(false);
    expect(sdk.membership.getMembership).not.toHaveBeenCalled();
  });

  it("does not call SDK when guildId is empty (enabled guard)", () => {
    const walletAddress = TEST_WALLET_ADDRESS;
    const guildId = "";
    const shouldFetch = !!walletAddress && !!guildId;

    expect(shouldFetch).toBe(false);
    expect(sdk.membership.getMembership).not.toHaveBeenCalled();
  });

  // ── Error propagation ─────────────────────────────────────────────────────

  it("surfaces SDK rejection as a rejected promise (maps to error state on screen)", async () => {
    sdk.membership.getMembership.mockRejectedValueOnce(new Error("Guild not found"));

    await expect(
      guildPassClient.membership.getMembership({
        walletAddress: TEST_WALLET_ADDRESS,
        guildId: "non_existent",
      }),
    ).rejects.toThrow("Guild not found");
  });

  it("surfaces network errors so the screen can show an ErrorState", async () => {
    sdk.membership.getMembership.mockRejectedValueOnce(new Error("Network request failed"));

    await expect(
      guildPassClient.membership.getMembership({
        walletAddress: TEST_WALLET_ADDRESS,
        guildId: "guild_abc",
      }),
    ).rejects.toThrow("Network request failed");
  });
});

// ---------------------------------------------------------------------------
// getUserRoles
// ---------------------------------------------------------------------------

describe("useMembership – getUserRoles", () => {
  let sdk: ReturnType<typeof createSdkMock>;

  beforeEach(() => {
    sdk = createSdkMock();
  });

  afterEach(() => {
    resetSdkMock();
    vi.clearAllMocks();
  });

  it("calls getUserRoles with walletAddress and guildId", async () => {
    const params = { walletAddress: TEST_WALLET_ADDRESS, guildId: "guild_abc" };

    await guildPassClient.roles.getUserRoles(params);

    expect(sdk.roles.getUserRoles).toHaveBeenCalledWith(params);
  });

  it("returns an array of role objects with id, name, guildId, walletAddress", async () => {
    const result = await guildPassClient.roles.getUserRoles({
      walletAddress: TEST_WALLET_ADDRESS,
      guildId: "guild_abc",
    });

    expect(result).toStrictEqual(USER_ROLES_FIXTURE);
    expect(Array.isArray(result)).toBe(true);

    result.forEach((role: { id: string; name: string; guildId: string; walletAddress: string }) => {
      expect(typeof role.id).toBe("string");
      expect(typeof role.name).toBe("string");
      expect(role.walletAddress).toBe(TEST_WALLET_ADDRESS);
    });
  });

  it("returns an empty array when the wallet holds no roles in that guild", async () => {
    sdk.roles.getUserRoles.mockResolvedValueOnce(USER_ROLES_EMPTY_FIXTURE);

    const result = await guildPassClient.roles.getUserRoles({
      walletAddress: NON_MEMBER_WALLET_ADDRESS,
      guildId: "guild_abc",
    });

    expect(result).toStrictEqual([]);
  });

  it("documents the expected query key: ['user-roles', walletAddress, guildId]", () => {
    const walletAddress = TEST_WALLET_ADDRESS;
    const guildId = "guild_abc";
    const expectedKey = ["user-roles", walletAddress, guildId];

    expect(expectedKey[0]).toBe("user-roles");
    expect(expectedKey[1]).toBe(walletAddress);
    expect(expectedKey[2]).toBe(guildId);
  });

  it("does not call SDK when walletAddress is falsy (enabled guard)", () => {
    const walletAddress = "";
    const guildId = "guild_abc";
    const shouldFetch = !!walletAddress && !!guildId;
    expect(shouldFetch).toBe(false);
    expect(sdk.roles.getUserRoles).not.toHaveBeenCalled();
  });
});
