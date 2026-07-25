import { queryKeys } from "../../lib/queryKeys";
import { guildPassClient } from "../../lib/guildpassClient";
import { useQuery } from "@tanstack/react-query";

export function useResolvedGuildName(guildId: string): string {
  const { data } = useQuery({
    queryKey: queryKeys.guild.byId(guildId),
    queryFn: () => guildPassClient.guilds.getGuild({ guildId }),
    enabled: !!guildId,
    staleTime: 1000 * 60 * 5,
    networkMode: "offlineFirst",
  });

  if (data && typeof data === "object" && "name" in (data as Record<string, unknown>)) {
    return (data as { name: string }).name;
  }

  return guildId;
}
