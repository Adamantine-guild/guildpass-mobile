import { useReducer, useCallback } from "react";
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

  const mutation = useMutation<AccessCheckResult, Error, AccessCheckParams>(
    (params) => guildPassClient.access.checkAccess(params) as Promise<AccessCheckResult>,
    {
      onSuccess: (result) => {
        dispatch({ type: "SUBMIT_SUCCESS", result });
      },
      onError: (error: Error) => {
        dispatch({ type: "SUBMIT_ERROR", error: error.message });
      },
    }
  );

  const startScan = useCallback(() => {
    dispatch({ type: "START_SCAN" });
  }, []);

  const checkAccess = useCallback(
    (params: AccessCheckParams) => {
      dispatch({ type: "SCANNED", payload: params });
      // Trigger the mutation which will transition to success/error
      mutation.mutate(params);
    },
    [mutation]
  );

  const reset = useCallback(() => {
    dispatch({ type: "RESET" });
  }, []);

  return { state, dispatch, startScan, checkAccess, reset };
};
