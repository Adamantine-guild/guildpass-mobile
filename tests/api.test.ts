/**
 * api.test.ts
 *
 * Smoke tests confirming that guildPassClient correctly delegates to the SDK.
 * Detailed contract verification lives in sdk-contract.test.ts and tests/hooks/.
 * These tests use the shared fixtures and mock factory so the mock shape is
 * consistent across the entire test suite.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createSdkMock, resetSdkMock } from "./fixtures/sdk.mock";
import { GUILD_DETAIL_FIXTURE } from "./fixtures/guild.fixtures";
import { ACCESS_GRANTED_FIXTURE, ACCESS_CHECK_PARAMS } from "./fixtures/access.fixtures";

vi.mock("@guildpass/sdk", async () => {
  // @ts-expect-error Vitest runs this async mock factory through Vite.
  const { mockSdkModule } = await import("./fixtures/sdk.mock");
  return mockSdkModule();
});
vi.mock("expo-constants", () => ({
  default: { expoConfig: { extra: { apiUrl: "https://api.guildpass.test", chainId: 1 } } },
}));

import { guildPassClient } from "../src/lib/guildpassClient";

describe("API Integrations", () => {
  let sdk: ReturnType<typeof createSdkMock>;

  beforeEach(() => {
    sdk = createSdkMock();
  });

  afterEach(() => {
    resetSdkMock();
    vi.clearAllMocks();
  });

  it("should call checkAccess with correct parameters", async () => {
    const result = await guildPassClient.access.checkAccess(ACCESS_CHECK_PARAMS);

    expect(result.hasAccess).toBe(true);
    expect(sdk.access.checkAccess).toHaveBeenCalledWith(ACCESS_CHECK_PARAMS);
  });

  it("should return the access check response shape from the fixture", async () => {
    const result = await guildPassClient.access.checkAccess(ACCESS_CHECK_PARAMS);

    expect(result).toStrictEqual(ACCESS_GRANTED_FIXTURE);
  });

  it("should fetch guild data", async () => {
    const guild = await guildPassClient.guilds.getGuild({ guildId: "guild_abc" });

    expect(guild.name).toBe(GUILD_DETAIL_FIXTURE.name);
    expect(sdk.guilds.getGuild).toHaveBeenCalledWith({ guildId: "guild_abc" });
  });

  it("should return the full guild fixture shape", async () => {
    const guild = await guildPassClient.guilds.getGuild({ guildId: "guild_abc" });

    expect(guild).toStrictEqual(GUILD_DETAIL_FIXTURE);
  });
});
