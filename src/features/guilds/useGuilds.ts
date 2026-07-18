import { useQuery } from "@tanstack/react-query";
import {
  buildGuildConfigQueryOptions,
  buildGuildQueryOptions,
  buildRolesQueryOptions,
} from "../../lib/queryPolicies";

export const useGuilds = () => {
  const useGuild = (guildId: string) => {
    return useQuery(buildGuildQueryOptions(guildId));
  };

  const useGuildConfig = (guildId: string) => {
    return useQuery(buildGuildConfigQueryOptions(guildId));
  };

  const useRoles = (guildId: string) => {
    return useQuery(buildRolesQueryOptions(guildId));
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
