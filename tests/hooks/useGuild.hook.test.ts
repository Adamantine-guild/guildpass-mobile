/**
 * useGuild hook – refactored query hook tests
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { GUILD_DETAIL_FIXTURE } from "../fixtures/guild.fixtures";
import { guildKeys } from "../../src/lib/queryKeys";

const getGuild = vi.fn();

vi.mock("../../src/lib/guildpassClient", () => ({
  guildPassClient: {
    guilds: {
      getGuild: (...args: unknown[]) => getGuild(...args),
    },
  },
}));

import { createGuildQueryOptions, useGuild } from "../../src/features/guilds/useGuild";

describe("useGuild", () => {
  beforeEach(() => {
    getGuild.mockReset();
    getGuild.mockResolvedValue(GUILD_DETAIL_FIXTURE);
  });

  it("calls useQuery directly from the custom hook module", () => {
    const source = readFileSync(
      resolve(__dirname, "../../src/features/guilds/useGuild.ts"),
      "utf8",
    );

    expect(source).toContain("return useQuery(createGuildQueryOptions(guildId));");
    expect(source).not.toMatch(/return\s*\{\s*getGuild/);
  });

  it("builds stable query options with the shared query key helper", () => {
    const options = createGuildQueryOptions("guild_abc");

    expect(options.queryKey).toStrictEqual(guildKeys.detail("guild_abc"));
    expect(options.enabled).toBe(true);
  });

  it("does not enable the query when guildId is empty", () => {
    const options = createGuildQueryOptions("");

    expect(options.enabled).toBe(false);
  });

  it("fetches guild data through the refactored query options", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    const result = await queryClient.fetchQuery(createGuildQueryOptions("guild_abc"));

    expect(getGuild).toHaveBeenCalledWith({ guildId: "guild_abc" });
    expect(result).toStrictEqual(GUILD_DETAIL_FIXTURE);
  });

  it("surfaces SDK errors through the refactored query options", async () => {
    getGuild.mockRejectedValueOnce(new Error("Network request failed"));

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    await expect(queryClient.fetchQuery(createGuildQueryOptions("guild_abc"))).rejects.toThrow(
      "Network request failed",
    );
  });

  it("exports a use* hook entry point for screens", () => {
    expect(typeof useGuild).toBe("function");
    expect(useGuild.name).toBe("useGuild");
  });
});
