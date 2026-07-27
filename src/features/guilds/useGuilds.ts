import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "../../lib/queryKeys";
import {
  GuildNotFoundError,
  guildsService,
} from "../../services/guilds/guildsService";

export { GuildNotFoundError };

export const useGuilds = () => {
  const useGuild = (guildId: string) => {
    return useQuery({
      queryKey: queryKeys.guild.byId(guildId),
      queryFn: () => guildsService.getGuild(guildId),
      enabled: !!guildId,
      networkMode: "offlineFirst",
    });
  };

  const useGuildConfig = (guildId: string) => {
    return useQuery({
      queryKey: queryKeys.guildConfig.byId(guildId),
      queryFn: () => guildsService.getGuildConfig(guildId),
      enabled: !!guildId,
      networkMode: "offlineFirst",
    });
  };

  const useRoles = (guildId: string) => {
    return useQuery({
      queryKey: queryKeys.guildRoles.byId(guildId),
      queryFn: () => guildsService.getRoles(guildId),
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
