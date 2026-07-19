import { useReducer, useCallback, useRef } from "react";
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

export type AccessCheckState =
  | { status: "idle" }
  | { status: "scanning" }
  | { status: "submitting" }
  | { status: "success"; result: AccessCheckResult }
  | { status: "error"; error: string };

export type AccessCheckAction =
  | { type: "START_SCAN" }
  | { type: "SCANNED"; payload: AccessCheckParams }
  | { type: "SUBMIT_SUCCESS"; result: AccessCheckResult }
  | { type: "SUBMIT_ERROR"; error: string }
  | { type: "RESET" };

function reducer(state: AccessCheckState, action: AccessCheckAction): AccessCheckState {
  switch (action.type) {
    case "START_SCAN":
      return { status: "scanning" };
    case "SCANNED":
      return { status: "submitting" };
    case "SUBMIT_SUCCESS":
      return { status: "success", result: action.result };
    case "SUBMIT_ERROR":
      return { status: "error", error: action.error };
    case "RESET":
      return { status: "idle" };
    default:
      return state;
  }
}

export const useAccessCheck = () => {
  const [state, dispatch] = useReducer(reducer, { status: "idle" } as AccessCheckState);
  const lastParamsRef = useRef<AccessCheckParams | null>(null);
  const multiChain = useMultiChainRoleEligibility();

  const mutation = useMutation<AccessCheckResult, Error, AccessCheckParams>({
    mutationKey: ["access-check"],
    mutationFn: (params) => guildPassClient.access.checkAccess(params) as Promise<AccessCheckResult>,
    onSuccess: (result) => {
      dispatch({ type: "SUBMIT_SUCCESS", result });
    },
    onError: (error: Error) => {
      dispatch({ type: "SUBMIT_ERROR", error: error.message });
    },
  });

  const startScan = useCallback(() => {
    dispatch({ type: "START_SCAN" });
  }, []);

  const checkAccess = useCallback(
    (params: AccessCheckParams, options?: Parameters<typeof mutation.mutate>[1]) => {
      lastParamsRef.current = params;
      dispatch({ type: "SCANNED", payload: params });
      mutation.mutate(params, options);

      void multiChain.resolve(params.guildId, params.walletAddress).catch(() => {
        // multiChain hook already stores per-chain errors.
      });
    },
    [mutation, multiChain],
  );

  const retry = useCallback(
    (options?: Parameters<typeof mutation.mutate>[1]) => {
      const params = lastParamsRef.current;
      if (!params) {
        return;
      }

      dispatch({ type: "SCANNED", payload: params });
      mutation.mutate(params, options);

      void multiChain.resolve(params.guildId, params.walletAddress).catch(() => {
        // multiChain hook already stores per-chain errors.
      });
    },
    [mutation, multiChain],
  );

  const reset = useCallback(() => {
    lastParamsRef.current = null;
    dispatch({ type: "RESET" });
    mutation.reset();
  }, [mutation]);

  return {
    state,
    dispatch,
    startScan,
    checkAccess,
    retry,
    reset,
    data: mutation.data,
    error: mutation.error?.message ?? null,
    isPending: mutation.isPending,
    isError: mutation.isError,
    mutate: checkAccess,
    mutateAsync: mutation.mutateAsync,
    perChainRoleEligibility: multiChain.perChain as PerChainRoleEligibilityResolution[],
    isResolvingRoleEligibility: multiChain.isResolving,
    roleEligibilityError: multiChain.error,
  };
};

