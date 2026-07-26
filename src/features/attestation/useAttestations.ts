/**
 * React hooks for attestation verification
 * Integrates attestation logic with React Query for data fetching and caching
 */

import { useQuery, useMutation } from "@tanstack/react-query";
import { useCallback } from "react";
import type { RoleAttestation, AttestationValidationResult } from "./types";
import type { AttestationService } from "./attestationService";
import { validateAttestation, getAttestationValidityStatus } from "./verifySignature";
import { getCachedIssuerKey } from "./issuerKeyRegistry";

/**
 * Hook to fetch and verify an attestation
 * Automatically caches results for offline use
 *
 * @param service The attestation service instance
 * @param walletAddress The wallet address
 * @param guildId The guild ID
 * @param roleId The role ID
 * @returns Query result with attestation and validity status
 */
export function useAttestationVerification(
  service: AttestationService | null,
  walletAddress: string | null,
  guildId: string | null,
  roleId: string | null,
) {
  return useQuery({
    queryKey: ["attestation", walletAddress, guildId, roleId],
    queryFn: async () => {
      if (!service || !walletAddress || !guildId || !roleId) {
        throw new Error("Missing required parameters");
      }

      return service.fetchAndVerifyAttestation(walletAddress, guildId, roleId);
    },
    enabled: !!service && !!walletAddress && !!guildId && !!roleId,
    networkMode: "offlineFirst",
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

/**
 * Hook to verify a locally cached attestation
 * Works offline if attestation and issuer key are cached
 *
 * @param service The attestation service instance
 * @param walletAddress The wallet address
 * @param guildId The guild ID
 * @param roleId The role ID
 * @returns Query result with validation status
 */
export function useLocalAttestationVerification(
  service: AttestationService | null,
  walletAddress: string | null,
  guildId: string | null,
  roleId: string | null,
) {
  return useQuery({
    queryKey: ["local-attestation-verification", walletAddress, guildId, roleId],
    queryFn: async () => {
      if (!service || !walletAddress || !guildId || !roleId) {
        throw new Error("Missing required parameters");
      }

      return service.verifyLocalAttestation(walletAddress, guildId, roleId);
    },
    enabled: !!service && !!walletAddress && !!guildId && !!roleId,
    networkMode: "always", // This can work offline once cached
    staleTime: Infinity, // Validation result doesn't change until expiry
  });
}

/**
 * Hook to check if a cached attestation exists for a role
 *
 * @param service The attestation service instance
 * @param walletAddress The wallet address
 * @param guildId The guild ID
 * @param roleId The role ID
 * @returns Query result with boolean
 */
export function useCachedAttestationExists(
  service: AttestationService | null,
  walletAddress: string | null,
  guildId: string | null,
  roleId: string | null,
) {
  return useQuery({
    queryKey: ["cached-attestation-exists", walletAddress, guildId, roleId],
    queryFn: async () => {
      if (!service || !walletAddress || !guildId || !roleId) {
        return false;
      }

      return service.hasCachedAttestation(walletAddress, guildId, roleId);
    },
    enabled: !!service && !!walletAddress && !!guildId && !!roleId,
    networkMode: "always", // Can work completely offline
    staleTime: Infinity,
  });
}

/**
 * Hook to get all cached attestations for a guild
 *
 * @param service The attestation service instance
 * @param walletAddress The wallet address
 * @param guildId The guild ID
 * @returns Query result with array of attestations
 */
export function useCachedAttestationsForGuild(
  service: AttestationService | null,
  walletAddress: string | null,
  guildId: string | null,
) {
  return useQuery({
    queryKey: ["cached-attestations-guild", walletAddress, guildId],
    queryFn: async () => {
      if (!service || !walletAddress || !guildId) {
        return [];
      }

      return service.getCachedAttestationsForGuild(walletAddress, guildId);
    },
    enabled: !!service && !!walletAddress && !!guildId,
    networkMode: "always", // Can work completely offline
    staleTime: Infinity,
  });
}

/**
 * Hook to refresh issuer key
 * Use after guild admin key rotation
 *
 * @param service The attestation service instance
 * @returns Mutation result
 */
export function useRefreshIssuerKey(service: AttestationService | null) {
  return useMutation({
    mutationFn: async (guildId: string) => {
      if (!service) {
        throw new Error("Service not initialized");
      }

      return service.refreshIssuerKey(guildId);
    },
  });
}

/**
 * Hook to validate a raw attestation with optional local issuer key
 * Useful for custom attestation validation scenarios
 *
 * @param attestation The attestation to validate
 * @param issuerAddress Optional issuer address (if not provided, will look up from cache)
 * @param chainId The blockchain chainId
 * @returns Validation result
 */
export function useAttestationValidation(
  attestation: RoleAttestation | null,
  issuerAddress: `0x${string}` | null,
  chainId: number,
) {
  return useQuery({
    queryKey: ["validate-attestation", attestation?.signature, issuerAddress],
    queryFn: async () => {
      if (!attestation) {
        throw new Error("No attestation provided");
      }

      let issuer = issuerAddress;

      if (!issuer) {
        // Try to get from cache
        const cachedKey = await getCachedIssuerKey(attestation.guildId);
        if (!cachedKey) {
          throw new Error("Issuer key not provided and not cached");
        }
        issuer = cachedKey.issuerAddress;
      }

      return validateAttestation(attestation, issuer, chainId);
    },
    enabled: !!attestation && (!!issuerAddress || true), // Will try cache fallback
    staleTime: Infinity, // Validation result is deterministic
  });
}

/**
 * Hook to get human-readable validity status of an attestation
 *
 * @param attestation The attestation
 * @returns Validity status string
 */
export function useAttestationValidityStatus(attestation: RoleAttestation | null): string {
  return attestation ? getAttestationValidityStatus(attestation) : "";
}

/**
 * Hook for convenient mutation of attestation fetching and verification
 * Simpler alternative to useAttestationVerification for specific use cases
 *
 * @param service The attestation service instance
 * @returns Mutation result
 */
export function useFetchAttestationMutation(service: AttestationService | null) {
  return useMutation({
    mutationFn: async (params: { walletAddress: string; guildId: string; roleId: string }) => {
      if (!service) {
        throw new Error("Service not initialized");
      }

      return service.fetchAndVerifyAttestation(params.walletAddress, params.guildId, params.roleId);
    },
  });
}
