import { useMutation } from "@tanstack/react-query";
import { guildPassClient } from "../../lib/guildpassClient";
import { useMultiChainRoleEligibility } from "./useMultiChainRoleEligibility";
import type { PerChainRoleEligibilityResolution } from "./roleEligibilityResolver";

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
  const [state, dispatch] = useReducer(reducer, { status: "idle" } as AccessCheckState);
  const multiChain = useMultiChainRoleEligibility();

  const mutation = useMutation<AccessCheckResult, Error, AccessCheckParams>(
    (params) => guildPassClient.access.checkAccess(params) as Promise<AccessCheckResult>,
    {
      onSuccess: (result) => {
        dispatch({ type: "SUBMIT_SUCCESS", result });
      },
      onError: (error: Error) => {
        dispatch({ type: "SUBMIT_ERROR", error: error.message });
      },
    },
  );

  const startScan = useCallback(() => {
    dispatch({ type: "START_SCAN" });
  }, []);

  const checkAccess = useCallback(
    async (params: AccessCheckParams) => {
      dispatch({ type: "SCANNED", payload: params });

      // Trigger the mutation for final aggregated result.
      mutation.mutate(params);

      // Best-effort: resolve per-chain role eligibility for partial UI.
      // Do not block the main screen.
      void multiChain.resolve(params.guildId, params.walletAddress).catch(() => {
        // multiChain hook already stores per-chain errors.
      });
    },
    [mutation, multiChain],
  );

  const reset = useCallback(() => {
    dispatch({ type: "RESET" });
  }, []);

  return {
    state,
    dispatch,
    startScan,
    checkAccess,
    reset,
    perChainRoleEligibility: multiChain.perChain as PerChainRoleEligibilityResolution[],
    isResolvingRoleEligibility: multiChain.isResolving,
    roleEligibilityError: multiChain.error,
  };
  return useMutation<AccessCheckResult, Error, AccessCheckParams>({
    mutationKey: ["access-check"],
    mutationFn: (params) =>
      guildPassClient.access.checkAccess(params) as Promise<AccessCheckResult>,
  });
};

