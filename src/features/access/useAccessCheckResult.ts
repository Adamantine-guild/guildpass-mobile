import { useQuery } from "@tanstack/react-query";
import { guildPassClient } from "../../lib/guildpassClient";
import { accessCheckKeys, type AccessCheckParams } from "../../lib/queryKeys";

export function useAccessCheckResult(params: AccessCheckParams) {
  return useQuery({
    queryKey: accessCheckKeys.detail(params),
    queryFn: () => guildPassClient.access.checkAccess(params),
    enabled: !!params.walletAddress && !!params.guildId && !!params.resourceId,
  });
}
