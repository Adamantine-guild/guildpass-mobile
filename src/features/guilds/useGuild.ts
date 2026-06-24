import { useQuery } from "@tanstack/react-query";
import { guildPassClient } from "../../lib/guildpassClient";
import { guildKeys } from "../../lib/queryKeys";

export function createGuildQueryOptions(guildId: string) {
  return {
    queryKey: guildKeys.detail(guildId),
    queryFn: () => guildPassClient.guilds.getGuild({ guildId }),
    enabled: !!guildId,
  } as const;
}

export function useGuild(guildId: string) {
  return useQuery(createGuildQueryOptions(guildId));
}
