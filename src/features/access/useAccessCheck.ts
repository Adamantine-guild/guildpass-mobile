import { useReducer, useCallback, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { MutateOptions } from "@tanstack/react-query";
import { guildPassClient } from "../../lib/guildpassClient";
import { useMultiChainRoleEligibility } from "./useMultiChainRoleEligibility";
import type { PerChainRoleEligibilityResolution } from "./roleEligibilityResolver";
import { useNetworkStatus } from "../offline/useNetworkStatus";
import { resolveAccessDecision, type AccessDecisionConfidence } from "./accessDecisionPipeline";
import {
  getCachedOfflineVerificationInputs,
  verifyOfflineCredentialAccess,
} from "./offlineCredentialVerifier";
import { queryKeys } from "../../lib/queryKeys";

type AccessCheckMutateOptions = MutateOptions<AccessCheckResult, Error, AccessCheckParams, unknown>;

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
  confidence?: AccessDecisionConfidence;
  verificationMode?: "online" | "offline";
  syncStatus?: "confirmed_online" | "pending_revalidation" | "offline_cached";
  lastSyncedAt?: string;
  credentialExpiresAt?: string;
  revocationSyncedAt?: string;
  discrepancy?: {
    type: "rpc" | "attestation";
    backendDecision: boolean;
    otherDecision: boolean;
  };
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
  const queryClient = useQueryClient();
  const { isOffline } = useNetworkStatus();
  const multiChain = useMultiChainRoleEligibility();

  const verifyCachedCredential = useCallback(
    async (params: AccessCheckParams) => {
      const result = await verifyOfflineCredentialAccess({
        ...params,
        ...getCachedOfflineVerificationInputs(queryClient, params.guildId),
      });

      if (!isOffline && result.availability === "unavailable") {
        throw new Error(result.reason);
      }

      return {
        valid: result.valid,
        error: result.valid ? undefined : result.reason,
        matchedRoles: result.matchedRoles,
        requiredRoles: result.requiredRoles,
        lastSyncedAt: result.lastSyncedAt,
        credentialExpiresAt: result.credentialExpiresAt,
        revocationSyncedAt: result.revocationSyncedAt,
      };
    },
    [isOffline, queryClient],
  );

  const mutation = useMutation<AccessCheckResult, Error, AccessCheckParams>({
    mutationKey: queryKeys.accessCheck.all,
    mutationFn: async (params) => {
      const decision = await resolveAccessDecision({
        walletAddress: params.walletAddress,
        guildId: params.guildId,
        resourceId: params.resourceId,
        backendCheck: isOffline
          ? undefined
          : () => guildPassClient.access.checkAccess(params) as Promise<AccessCheckResult>,
        attestationVerifier: () => verifyCachedCredential(params),
        options: {
          allowRpcFallback: false,
          allowAttestationFallback: true,
        },
      });

      if (!isOffline && decision.confidence === "all_sources_failed") {
        const backendError =
          decision.sources.backend && !decision.sources.backend.success
            ? decision.sources.backend.error
            : undefined;
        throw new Error(backendError ?? decision.reason ?? "Access check failed");
      }

      const usesCachedCredential =
        decision.confidence === "partial_attestation_only" ||
        decision.confidence === "backend_unavailable_attestation_verified";
      const attestationSource =
        decision.sources.attestation?.success === true ? decision.sources.attestation : undefined;

      return {
        hasAccess: decision.granted,
        reason: decision.reason,
        matchedRoles: decision.matchedRoles,
        requiredRoles: decision.requiredRoles,
        confidence: decision.confidence,
        verificationMode: usesCachedCredential ? "offline" : "online",
        syncStatus: usesCachedCredential
          ? isOffline
            ? "offline_cached"
            : "pending_revalidation"
          : "confirmed_online",
        lastSyncedAt: attestationSource?.lastSyncedAt,
        credentialExpiresAt: attestationSource?.credentialExpiresAt,
        revocationSyncedAt: attestationSource?.revocationSyncedAt,
        discrepancy: decision.discrepancy,
      };
    },
    onSuccess: (result, variables) => {
      queryClient.setQueryData(
        queryKeys.accessCheck.byParams(
          variables.walletAddress,
          variables.guildId,
          variables.resourceId,
        ),
        result,
      );
      dispatch({ type: "SUBMIT_SUCCESS", result });
    },
    onError: (error: Error) => {
      dispatch({ type: "SUBMIT_ERROR", error: error.message });
    },
  });
  const { data, error, isPending, isError, mutate, mutateAsync, reset: resetMutation } = mutation;

  const startScan = useCallback(() => {
    dispatch({ type: "START_SCAN" });
  }, []);

  const checkAccess = useCallback(
    (params: AccessCheckParams, options?: AccessCheckMutateOptions) => {
      lastParamsRef.current = params;
      dispatch({ type: "SCANNED", payload: params });
      mutate(params, options);

      if (!isOffline) {
        void multiChain.resolve(params.guildId, params.walletAddress).catch(() => {
          // multiChain hook already stores per-chain errors.
        });
      }
    },
    [isOffline, mutate, multiChain],
  );

  const retry = useCallback(
    (options?: AccessCheckMutateOptions) => {
      const params = lastParamsRef.current;
      if (!params) {
        return;
      }

      dispatch({ type: "SCANNED", payload: params });
      mutate(params, options);

      if (!isOffline) {
        void multiChain.resolve(params.guildId, params.walletAddress).catch(() => {
          // multiChain hook already stores per-chain errors.
        });
      }
    },
    [isOffline, mutate, multiChain],
  );

  const reset = useCallback(() => {
    lastParamsRef.current = null;
    dispatch({ type: "RESET" });
    resetMutation();
  }, [resetMutation]);

  return {
    state,
    dispatch,
    startScan,
    checkAccess,
    retry,
    reset,
    data,
    error: error?.message ?? null,
    isPending,
    isError,
    mutate: checkAccess,
    mutateAsync,
    perChainRoleEligibility: multiChain.perChain as PerChainRoleEligibilityResolution[],
    isResolvingRoleEligibility: multiChain.isResolving,
    resolvingRoleEligibilityChainIds: multiChain.resolvingChainIds,
    retryRoleEligibilityChain: multiChain.retryChain,
    roleEligibilityError: multiChain.error,
  };
};
