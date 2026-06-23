import { useQuery } from "@tanstack/react-query";
import { guildPassClient } from "../../lib/guildpassClient";

export const useAccessCheck = () => {
  const checkAccess = (params: {
    walletAddress: string;
    guildId: string;
    resourceId: string;
  }) => {
    return useQuery({
      queryKey: ["access-check", params],
      queryFn: () => guildPassClient.access.checkAccess(params),
      enabled: !!params.walletAddress && !!params.guildId && !!params.resourceId,
    });
  };

  return {
    checkAccess,
  };
};
