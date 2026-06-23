import { useQuery } from "@tanstack/react-query";
import { guildPassClient } from "../../lib/guildpassClient";

export const useGuilds = () => {
  const getGuild = (guildId: string) => {
    return useQuery({
      queryKey: ["guild", guildId],
      queryFn: () => guildPassClient.guilds.getGuild({ guildId }),
      enabled: !!guildId,
    });
  };

  const getGuildConfig = (guildId: string) => {
    return useQuery({
      queryKey: ["guild-config", guildId],
      queryFn: () => guildPassClient.guilds.getGuildConfig({ guildId }),
      enabled: !!guildId,
    });
  };

  const getRoles = (guildId: string) => {
    return useQuery({
      queryKey: ["guild-roles", guildId],
      queryFn: () => guildPassClient.roles.getRoles({ guildId }),
      enabled: !!guildId,
    });
  };

  return {
    getGuild,
    getGuildConfig,
    getRoles,
  };
};
