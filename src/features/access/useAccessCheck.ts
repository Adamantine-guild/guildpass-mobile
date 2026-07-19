import { useMutation } from "@tanstack/react-query";
import { guildPassClient } from "../../lib/guildpassClient";

export type AccessCheckParams = {
  walletAddress: string;
  guildId: string;
  resourceId: string;
};

export type AccessCheckResult = {
  hasAccess: boolean;
  reason?: string;
  matchedRoles: string[];
  requiredRoles: string[];
};

export const useAccessCheck = () => {
  return useMutation<AccessCheckResult, Error, AccessCheckParams>({
    mutationKey: ["access-check"],
    mutationFn: (params) =>
      guildPassClient.access.checkAccess(params) as Promise<AccessCheckResult>,
  });
};
