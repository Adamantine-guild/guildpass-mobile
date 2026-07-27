import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../../src/services/api/errors";

const sdkMocks = vi.hoisted(() => ({
  getGuild: vi.fn(),
  getGuildConfig: vi.fn(),
  getRoles: vi.fn(),
}));

vi.mock("../../../src/lib/guildpassClient", () => ({
  guildPassClient: {
    guilds: {
      getGuild: sdkMocks.getGuild,
      getGuildConfig: sdkMocks.getGuildConfig,
    },
    roles: {
      getRoles: sdkMocks.getRoles,
    },
  },
}));

import {
  GuildNotFoundError,
  guildsService,
} from "../../../src/services/guilds/guildsService";

const guildFixture = {
  id: "guild_abc",
  name: "Guild ABC",
};

const guildConfigFixture = {
  guildId: "guild_abc",
  requiredRoles: ["role_1"],
  accessPolicy: "any",
};

const rolesFixture = [
  {
    id: "role_1",
    name: "Member",
    guildId: "guild_abc",
  },
];

describe("guildsService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sdkMocks.getGuild.mockResolvedValue(guildFixture);
    sdkMocks.getGuildConfig.mockResolvedValue(guildConfigFixture);
    sdkMocks.getRoles.mockResolvedValue(rolesFixture);
  });

  it("returns getGuild, getGuildConfig, and getRoles SDK responses unchanged", async () => {
    await expect(guildsService.getGuild("guild_abc")).resolves.toEqual(guildFixture);
    await expect(guildsService.getGuildConfig("guild_abc")).resolves.toEqual(
      guildConfigFixture,
    );
    await expect(guildsService.getRoles("guild_abc")).resolves.toEqual(rolesFixture);

    expect(sdkMocks.getGuild).toHaveBeenCalledWith({ guildId: "guild_abc" });
    expect(sdkMocks.getGuildConfig).toHaveBeenCalledWith({ guildId: "guild_abc" });
    expect(sdkMocks.getRoles).toHaveBeenCalledWith({ guildId: "guild_abc" });
  });

  it("normalizes a transient SDK error and retries before succeeding", async () => {
    const serverError = Object.assign(new Error("Service unavailable"), {
      status: 500,
    });
    sdkMocks.getGuild.mockRejectedValueOnce(serverError);

    await expect(guildsService.getGuild("guild_abc")).resolves.toEqual(guildFixture);
    expect(sdkMocks.getGuild).toHaveBeenCalledTimes(2);
  });

  it("throws GuildNotFoundError for an SDK error with status 404 and no not-found message", async () => {
    const missingGuildError = Object.assign(new Error("Missing resource"), {
      status: 404,
    });
    sdkMocks.getGuild.mockRejectedValueOnce(missingGuildError);

    const result = guildsService.getGuild("guild_404");

    await expect(result).rejects.toBeInstanceOf(GuildNotFoundError);
    await expect(result).rejects.toMatchObject({
      code: "not_found",
      status: 404,
      retryable: false,
      message: "Guild not found: guild_404",
      userMessage: "We couldn't find this guild.",
      feature: "guilds",
      operation: "getGuild",
    } satisfies Partial<ApiError>);
    expect(sdkMocks.getGuild).toHaveBeenCalledTimes(1);
  });

  it("preserves regex-based GuildNotFoundError detection for SDK error messages", async () => {
    sdkMocks.getGuild.mockRejectedValueOnce(new Error("Guild not found"));

    await expect(guildsService.getGuild("guild_missing")).rejects.toBeInstanceOf(
      GuildNotFoundError,
    );
    expect(sdkMocks.getGuild).toHaveBeenCalledTimes(1);
  });
});
