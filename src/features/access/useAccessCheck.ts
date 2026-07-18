import { useReducer, useCallback, useRef } from "react";
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

// ----- State machine definitions -----
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

/**
 * Hook that manages the access‑check flow using a reducer.
 * Call `startScan` to put the machine into the scanning state.
 * Call `checkAccess` with validated parameters to trigger the API call.
 * Call `reset` to return to idle after an error.
 */
export const useAccessCheck = () => {
  const [state, dispatch] = useReducer(reducer, { status: "idle" } as AccessCheckState);
  const lastParamsRef = useRef<AccessCheckParams | null>(null);

  const mutation = useMutation<AccessCheckResult, Error, AccessCheckParams>({
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
    },
    [mutation],
  );

  const retry = useCallback(
    (options?: Parameters<typeof mutation.mutate>[1]) => {
      const params = lastParamsRef.current;
      if (!params) {
        return;
      }

      dispatch({ type: "SCANNED", payload: params });
      mutation.mutate(params, options);
    },
    [mutation],
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
  };
};
