import { useQuery } from "@tanstack/react-query";
import { guildPassClient } from "../../lib/guildpassClient";

export class GuildNotFoundError extends Error {
  constructor(guildId: string) {
    super(`Guild not found: ${guildId}`);
    this.name = "GuildNotFoundError";
  }
}

export const useGuilds = () => {
  const useGuild = (guildId: string) => {
    return useQuery({
      queryKey: ["guild", guildId],
      queryFn: async () => {
        try {
          return await guildPassClient.guilds.getGuild({ guildId });
        } catch (error) {
          if (error instanceof Error && /not found/i.test(error.message)) {
            throw new GuildNotFoundError(guildId);
          }
          throw error;
        }
      },
      enabled: !!guildId,
      networkMode: "offlineFirst",
    });
  };

  const useGuildConfig = (guildId: string) => {
    return useQuery({
      queryKey: ["guild-config", guildId],
      queryFn: () => guildPassClient.guilds.getGuildConfig({ guildId }),
      enabled: !!guildId,
      networkMode: "offlineFirst",
    });
  };

  const useRoles = (guildId: string) => {
    return useQuery({
      queryKey: ["guild-roles", guildId],
      queryFn: () => guildPassClient.roles.getRoles({ guildId }),
      enabled: !!guildId,
      networkMode: "offlineFirst",
    });
  };

  return {
    getGuild: useGuild,
    getGuildConfig: useGuildConfig,
    getRoles: useRoles,
    useGuild,
    useGuildConfig,
    useRoles,
  };
};
