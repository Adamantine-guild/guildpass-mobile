/**
 * useAccessDecision Hook
 * 
 * React hook that wraps the resolveAccessDecision orchestration function.
 * Provides a unified access decision with confidence level and provenance information.
 * 
 * This hook integrates all three verification sources:
 * 1. Backend checkAccess (via guildPassClient)
 * 2. RPC Fallback Resolver (via useMultiChainRoleEligibility)
 * 3. EIP-712 Attestations (via AttestationService)
 * 
 * See docs/access-decision-pipeline.md for the full decision policy.
 */

import { useState, useCallback, useRef } from "react";
import { guildPassClient } from "../../lib/guildpassClient";
import { useMultiChainRoleEligibility } from "./useMultiChainRoleEligibility";
import { resolveAccessDecision, type AccessDecisionResult, type ResolveAccessDecisionParams } from "./accessDecisionPipeline";
import type { AccessCheckParams } from "./useAccessCheck";
import type { PerChainRoleEligibilityResolution } from "./roleEligibilityResolver";

export type AccessDecisionState =
  | { status: "idle" }
  | { status: "resolving" }
  | { status: "success"; result: AccessDecisionResult }
  | { status: "error"; error: string };

export type AccessDecisionAction =
  | { type: "START_RESOLVING" }
  | { type: "RESOLVED"; result: AccessDecisionResult }
  | { type: "ERROR"; error: string }
  | { type: "RESET" };

function reducer(state: AccessDecisionState, action: AccessDecisionAction): AccessDecisionState {
  switch (action.type) {
    case "START_RESOLVING":
      return { status: "resolving" };
    case "RESOLVED":
      return { status: "success", result: action.result };
    case "ERROR":
      return { status: "error", error: action.error };
    case "RESET":
      return { status: "idle" };
    default:
      return state;
  }
}

export type UseAccessDecisionOptions = {
  requireBackend?: boolean;
  allowRpcFallback?: boolean;
  allowAttestationFallback?: boolean;
  // Optional: Provide custom attestation verifier
  attestationVerifier?: (walletAddress: string, guildId: string, resourceId: string) => Promise<{ valid: boolean; error?: string }>;
};

export const useAccessDecision = (options: UseAccessDecisionOptions = {}) => {
  const [state, dispatch] = useReducer(reducer, { status: "idle" } as AccessDecisionState);
  const lastParamsRef = useRef<AccessCheckParams | null>(null);
  const multiChain = useMultiChainRoleEligibility();

  const {
    requireBackend = false,
    allowRpcFallback = true,
    allowAttestationFallback = true,
    attestationVerifier,
  } = options;

  const resolveDecision = useCallback(
    async (params: AccessCheckParams) => {
      lastParamsRef.current = params;
      dispatch({ type: "START_RESOLVING" });

      try {
        const result = await resolveAccessDecision({
          walletAddress: params.walletAddress,
          guildId: params.guildId,
          resourceId: params.resourceId,
          backendCheck: async () => {
            return await guildPassClient.access.checkAccess(params) as any;
          },
          rpcResolver: async () => {
            return await multiChain.resolve(params.guildId, params.walletAddress);
          },
          attestationVerifier: attestationVerifier
            ? () => attestationVerifier(params.walletAddress, params.guildId, params.resourceId)
            : undefined,
          options: {
            requireBackend,
            allowRpcFallback,
            allowAttestationFallback,
          },
        });

        dispatch({ type: "RESOLVED", result });
        return result;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error resolving access decision";
        dispatch({ type: "ERROR", error: errorMessage });
        throw error;
      }
    },
    [multiChain, requireBackend, allowRpcFallback, allowAttestationFallback, attestationVerifier],
  );

  const startResolving = useCallback(() => {
    dispatch({ type: "START_RESOLVING" });
  }, []);

  const retry = useCallback(
    async (params?: AccessCheckParams) => {
      const paramsToUse = params ?? lastParamsRef.current;
      if (!paramsToUse) {
        return;
      }
      return resolveDecision(paramsToUse);
    },
    [resolveDecision],
  );

  const reset = useCallback(() => {
    lastParamsRef.current = null;
    dispatch({ type: "RESET" });
  }, []);

  return {
    state,
    dispatch,
    startResolving,
    resolveDecision,
    retry,
    reset,
    result: state.status === "success" ? state.result : null,
    error: state.status === "error" ? state.error : null,
    isResolving: state.status === "resolving",
    isSuccess: state.status === "success",
    isError: state.status === "error",
    isIdle: state.status === "idle",
    // Expose the multi-chain resolver state for debugging
    perChainRoleEligibility: multiChain.perChain as PerChainRoleEligibilityResolution[],
    isResolvingRoleEligibility: multiChain.isResolving,
    roleEligibilityError: multiChain.error,
  };
};
