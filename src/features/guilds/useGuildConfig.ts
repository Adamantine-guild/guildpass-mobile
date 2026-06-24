import { useQuery } from "@tanstack/react-query";
import { guildPassClient } from "../../lib/guildpassClient";
import { guildKeys } from "../../lib/queryKeys";

export function useGuildConfig(guildId: string) {
  return useQuery({
    queryKey: guildKeys.config(guildId),
    queryFn: () => guildPassClient.guilds.getGuildConfig({ guildId }),
    enabled: !!guildId,
  });
}
