import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  GUILD_CONFIG_FIXTURE,
  GUILD_DETAIL_FIXTURE,
  ROLES_EMPTY_FIXTURE,
  ROLES_LIST_FIXTURE,
} from "../fixtures/guild.fixtures";

const serviceMocks = vi.hoisted(() => ({
  getGuild: vi.fn(),
  getGuildConfig: vi.fn(),
  getRoles: vi.fn(),
}));

const useQueryMock = vi.hoisted(() => vi.fn((options: unknown) => options));

vi.mock("@tanstack/react-query", () => ({
  useQuery: useQueryMock,
}));

vi.mock("../../src/services/guilds/guildsService", () => {
  class GuildNotFoundError extends Error {
    constructor(guildId: string) {
      super(`Guild not found: ${guildId}`);
      this.name = "GuildNotFoundError";
    }
  }

  return {
    GuildNotFoundError,
    guildsService: serviceMocks,
  };
});

import {
  GuildNotFoundError,
  useGuilds,
} from "../../src/features/guilds/useGuilds";

interface CapturedQuery {
  queryKey: readonly unknown[];
  queryFn: () => Promise<unknown>;
  enabled: boolean;
  networkMode: string;
}

function asQuery(value: unknown): CapturedQuery {
  return value as CapturedQuery;
}

describe("GuildNotFoundError public export", () => {
  it("extends Error and has the correct name and message", () => {
    const error = new GuildNotFoundError("guild_404");

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("GuildNotFoundError");
    expect(error.message).toMatch(/guild_404/);
  });
});

describe("useGuilds - getGuild", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    serviceMocks.getGuild.mockResolvedValue(GUILD_DETAIL_FIXTURE);
    serviceMocks.getGuildConfig.mockResolvedValue(GUILD_CONFIG_FIXTURE);
    serviceMocks.getRoles.mockResolvedValue(ROLES_LIST_FIXTURE);
  });

  it("calls guildsService.getGuild with the guild ID", async () => {
    const query = asQuery(useGuilds().getGuild("guild_abc"));

    await query.queryFn();

    expect(serviceMocks.getGuild).toHaveBeenCalledTimes(1);
    expect(serviceMocks.getGuild).toHaveBeenCalledWith("guild_abc");
  });

  it("returns the full guild fixture without transforming fields", async () => {
    const query = asQuery(useGuilds().getGuild("guild_abc"));

    const result = await query.queryFn();

    expect(result).toStrictEqual(GUILD_DETAIL_FIXTURE);
  });

  it("surfaces service rejection as a rejected query", async () => {
    const networkError = new Error("Network request failed");
    serviceMocks.getGuild.mockRejectedValueOnce(networkError);
    const query = asQuery(useGuilds().getGuild("guild_abc"));

    await expect(query.queryFn()).rejects.toBe(networkError);
  });

  it("uses the existing guild query key", () => {
    const query = asQuery(useGuilds().getGuild("guild_abc"));

    expect(query.queryKey).toStrictEqual(["guild", "guild_abc"]);
  });

  it("surfaces GuildNotFoundError from the service", async () => {
    const notFoundError = new GuildNotFoundError("nonexistent");
    serviceMocks.getGuild.mockRejectedValueOnce(notFoundError);
    const query = asQuery(useGuilds().getGuild("nonexistent"));

    await expect(query.queryFn()).rejects.toBeInstanceOf(GuildNotFoundError);
  });

  it("preserves generic service errors unchanged", async () => {
    const serviceError = new Error("Service unavailable");
    serviceMocks.getGuild.mockRejectedValueOnce(serviceError);
    const query = asQuery(useGuilds().getGuild("guild_abc"));

    await expect(query.queryFn()).rejects.toBe(serviceError);
  });

  it("disables the query when guildId is empty", () => {
    const query = asQuery(useGuilds().getGuild(""));

    expect(query.enabled).toBe(false);
    expect(serviceMocks.getGuild).not.toHaveBeenCalled();
  });
});

describe("useGuilds - getGuildConfig", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    serviceMocks.getGuildConfig.mockResolvedValue(GUILD_CONFIG_FIXTURE);
  });

  it("calls guildsService.getGuildConfig with the guild ID", async () => {
    const query = asQuery(useGuilds().getGuildConfig("guild_abc"));

    await query.queryFn();

    expect(serviceMocks.getGuildConfig).toHaveBeenCalledWith("guild_abc");
  });

  it("returns the full guild config fixture", async () => {
    const query = asQuery(useGuilds().getGuildConfig("guild_abc"));

    await expect(query.queryFn()).resolves.toStrictEqual(GUILD_CONFIG_FIXTURE);
  });

  it("uses the existing guild config query key", () => {
    const query = asQuery(useGuilds().getGuildConfig("guild_abc"));

    expect(query.queryKey).toStrictEqual(["guild-config", "guild_abc"]);
  });
});

describe("useGuilds - getRoles", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    serviceMocks.getRoles.mockResolvedValue(ROLES_LIST_FIXTURE);
  });

  it("calls guildsService.getRoles with the guild ID", async () => {
    const query = asQuery(useGuilds().getRoles("guild_abc"));

    await query.queryFn();

    expect(serviceMocks.getRoles).toHaveBeenCalledWith("guild_abc");
  });

  it("returns the full roles fixture", async () => {
    const query = asQuery(useGuilds().getRoles("guild_abc"));

    await expect(query.queryFn()).resolves.toStrictEqual(ROLES_LIST_FIXTURE);
  });

  it("returns an empty roles array unchanged", async () => {
    serviceMocks.getRoles.mockResolvedValueOnce(ROLES_EMPTY_FIXTURE);
    const query = asQuery(useGuilds().getRoles("guild_123"));

    await expect(query.queryFn()).resolves.toStrictEqual([]);
  });

  it("surfaces service rejection as a rejected query", async () => {
    const serviceError = new Error("Guild not found");
    serviceMocks.getRoles.mockRejectedValueOnce(serviceError);
    const query = asQuery(useGuilds().getRoles("non_existent"));

    await expect(query.queryFn()).rejects.toBe(serviceError);
  });

  it("uses the existing guild roles query key", () => {
    const query = asQuery(useGuilds().getRoles("guild_abc"));

    expect(query.queryKey).toStrictEqual(["guild-roles", "guild_abc"]);
  });

  it("disables the query when guildId is empty", () => {
    const query = asQuery(useGuilds().getRoles(""));

    expect(query.enabled).toBe(false);
    expect(serviceMocks.getRoles).not.toHaveBeenCalled();
  });
});

describe("useGuilds public interface", () => {
  it("preserves the get* and use* aliases", () => {
    const guilds = useGuilds();

    expect(guilds.getGuild).toBe(guilds.useGuild);
    expect(guilds.getGuildConfig).toBe(guilds.useGuildConfig);
    expect(guilds.getRoles).toBe(guilds.useRoles);
  });
});
