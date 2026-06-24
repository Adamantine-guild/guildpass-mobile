import { useQuery } from "@tanstack/react-query";
import { guildPassClient } from "../../lib/guildpassClient";
import { guildKeys } from "../../lib/queryKeys";

export function useGuildRoles(guildId: string) {
  return useQuery({
    queryKey: guildKeys.roles(guildId),
    queryFn: () => guildPassClient.roles.getRoles({ guildId }),
    enabled: !!guildId,
  });
}
