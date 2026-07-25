/**
 * Integration of attestation verification with access check flow
 * Augments access check results with cryptographic proof validation
 */

import { useMutation } from "@tanstack/react-query";
import { guildPassClient } from "../../lib/guildpassClient";
import type { AccessCheckParams, AccessCheckResult } from "./useAccessCheck";
import type { AttestationService } from "../attestation/attestationService";

/**
 * Enhanced access check result with attestation verification
 */
export interface AttestationAugmentedAccessCheck extends AccessCheckResult {
  /** Whether the access was verified via cached attestation (offline) */
  verifiedViaAttestation?: boolean;

  /** Fallback to backend check if attestation verification failed */
  backedByBackend: boolean;
}

/**
 * Hook for access check with attestation fallback
 * First tries offline attestation verification, then falls back to backend
 *
 * @param attestationService The attestation service instance
 * @returns Mutation function for access checking
 */
export function useAccessCheckWithAttestations(attestationService: AttestationService | null) {
  return useMutation<AttestationAugmentedAccessCheck, Error, AccessCheckParams>({
    mutationKey: ["access-check-with-attestations"],
    mutationFn: async (params: AccessCheckParams) => {
      // First, try to verify using cached attestation
      if (attestationService) {
        const cachedAttestation = await attestationService.hasCachedAttestation(
          params.walletAddress,
          params.guildId,
          "access-" + params.resourceId, // Use resource-specific role key
        );

        if (cachedAttestation) {
          return {
            hasAccess: true,
            matchedRoles: ["attestation-verified"],
            requiredRoles: [],
            verifiedViaAttestation: true,
            backedByBackend: false,
          };
        }
      }

      // Fall back to backend check if attestation not available
      const backendResult = await guildPassClient.access.checkAccess(params);

      return {
        ...backendResult,
        verifiedViaAttestation: false,
        backedByBackend: true,
      };
    },
    networkMode: "offlineFirst",
  });
}

/**
 * Hook to fetch and cache access attestations for a guild
 * Preemptively fetches attestations to enable offline access checks
 *
 * @param attestationService The attestation service instance
 * @returns Mutation function
 */
export function useCacheAccessAttestationsMutation(attestationService: AttestationService | null) {
  return useMutation({
    mutationFn: async (params: {
      walletAddress: string;
      guildId: string;
      resourceIds: string[];
    }) => {
      if (!attestationService) {
        throw new Error("Attestation service not initialized");
      }

      const results = [];

      for (const resourceId of params.resourceIds) {
        try {
          const result = await attestationService.fetchAndVerifyAttestation(
            params.walletAddress,
            params.guildId,
            "access-" + resourceId,
          );
          results.push({ resourceId, ...result });
        } catch (error) {
          results.push({
            resourceId,
            valid: false,
            error: error instanceof Error ? error.message : "Unknown error",
          });
        }
      }

      return results;
    },
  });
}
