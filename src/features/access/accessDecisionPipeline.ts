/**
 * Unified Access Decision Pipeline
 * 
 * Orchestrates three independent access verification sources:
 * 1. Backend checkAccess (authoritative when available)
 * 2. RPC Fallback Resolver (on-chain role eligibility)
 * 3. EIP-712 Attestations (offline-verifiable proofs)
 * 
 * Returns a single decision with confidence level and provenance information.
 * See docs/access-decision-pipeline.md for the full decision policy.
 */

import type { AccessCheckResult } from './useAccessCheck';
import type { PerChainRoleEligibilityResolution } from './roleEligibilityResolver';

export type AccessDecisionSource = 'backend' | 'rpc' | 'attestation';

export type AccessDecisionConfidence =
  | 'backend_verified'
  | 'backend_unavailable_rpc_verified'
  | 'backend_unavailable_attestation_verified'
  | 'rpc_corroborated'
  | 'rpc_disagreed'
  | 'attestation_corroborated'
  | 'attestation_disagreed'
  | 'all_sources_failed'
  | 'partial_rpc_only'
  | 'partial_attestation_only';

type BackendSourceResult =
  | { success: true; result: AccessCheckResult }
  | { success: false; error: string };

type RpcSourceResult =
  | { success: true; resolvedRoles: string[] }
  | { success: false; error: string };

type AttestationSourceResult =
  | {
      success: true;
      valid: boolean;
      error?: string;
      matchedRoles?: string[];
      requiredRoles?: string[];
      lastSyncedAt?: string;
      credentialExpiresAt?: string;
      revocationSyncedAt?: string;
    }
  | {
      success: false;
      valid: false;
      error: string;
    };

export type AccessDecisionResult = {
  granted: boolean;
  confidence: AccessDecisionConfidence;
  sources: {
    backend?: BackendSourceResult;
    rpc?: RpcSourceResult;
    attestation?: AttestationSourceResult;
  };
  matchedRoles: string[];
  requiredRoles: string[];
  reason?: string;
  discrepancy?: {
    type: 'rpc' | 'attestation';
    backendDecision: boolean;
    otherDecision: boolean;
  };
};

export type ResolveAccessDecisionParams = {
  walletAddress: string;
  guildId: string;
  resourceId: string;
  backendCheck?: () => Promise<AccessCheckResult>;
  rpcResolver?: () => Promise<PerChainRoleEligibilityResolution[]>;
  attestationVerifier?: () => Promise<{
    valid: boolean;
    error?: string;
    matchedRoles?: string[];
    requiredRoles?: string[];
    lastSyncedAt?: string;
    credentialExpiresAt?: string;
    revocationSyncedAt?: string;
  }>;
  options?: {
    requireBackend?: boolean;
    allowRpcFallback?: boolean;
    allowAttestationFallback?: boolean;
  };
};

/**
 * Orchestrates all three access verification sources according to the documented policy.
 * 
 * Execution flow:
 * 1. Execute all available sources in parallel
 * 2. Wait for backend result (primary source)
 * 3. Corroborate with RPC and attestation if backend succeeded
 * 4. Apply fallback logic if backend failed
 * 5. Return unified decision with confidence level
 */
export async function resolveAccessDecision(
  params: ResolveAccessDecisionParams
): Promise<AccessDecisionResult> {
  const {
    walletAddress,
    guildId,
    resourceId,
    backendCheck,
    rpcResolver,
    attestationVerifier,
    options = {},
  } = params;

  const {
    requireBackend = false,
    allowRpcFallback = true,
    allowAttestationFallback = true,
  } = options;

  // Execute all available sources in parallel
  const backendPromise: Promise<BackendSourceResult | undefined> = backendCheck
    ? backendCheck().then(
        (result) => ({ success: true as const, result }),
        (error) => ({
          success: false as const,
          error: error instanceof Error ? error.message : String(error),
        }),
      )
    : Promise.resolve(undefined);

  const rpcPromise: Promise<RpcSourceResult | undefined> = rpcResolver
    ? rpcResolver().then(
        (resolutions) => {
          const resolvedRoles = resolutions
            .filter((r) => r.status === 'resolved' && r.resolvedRoles)
            .flatMap((r) => r.resolvedRoles ?? []);
          return { success: true as const, resolvedRoles };
        },
        (error) => ({
          success: false as const,
          error: error instanceof Error ? error.message : String(error),
        }),
      )
    : Promise.resolve(undefined);

  const attestationPromise: Promise<AttestationSourceResult | undefined> = attestationVerifier
    ? attestationVerifier().then(
        (result) => ({ success: true as const, ...result }),
        (error) => ({
          success: false as const,
          valid: false,
          error: error instanceof Error ? error.message : String(error),
        }),
      )
    : Promise.resolve(undefined);

  // Wait for all sources to complete
  const [backendResult, rpcResult, attestationResult] = await Promise.all([
    backendPromise,
    rpcPromise,
    attestationPromise,
  ]);

  // Build sources object for result
  const sources: AccessDecisionResult['sources'] = {};
  if (backendResult) sources.backend = backendResult;
  if (rpcResult) sources.rpc = rpcResult;
  if (attestationResult) sources.attestation = attestationResult;

  // Decision logic based on policy
  if (backendResult?.success) {
    // Backend succeeded - use as baseline
    const backendGranted = backendResult.result.hasAccess;
    const matchedRoles = backendResult.result.matchedRoles ?? [];
    const requiredRoles = backendResult.result.requiredRoles ?? [];

    // Corroborate with RPC
    if (rpcResult?.success && rpcResult.resolvedRoles) {
      const rpcGranted = rpcResult.resolvedRoles.length > 0;
      
      if (backendGranted !== rpcGranted) {
        return {
          granted: backendGranted, // Backend wins
          confidence: 'rpc_disagreed',
          sources,
          matchedRoles,
          requiredRoles,
          reason: backendResult.result.reason,
          discrepancy: {
            type: 'rpc',
            backendDecision: backendGranted,
            otherDecision: rpcGranted,
          },
        };
      }
      
      // RPC corroborated
      return {
        granted: backendGranted,
        confidence: 'rpc_corroborated',
        sources,
        matchedRoles,
        requiredRoles,
        reason: backendResult.result.reason,
      };
    }

    // Corroborate with attestation
    if (attestationResult?.success) {
      const attestationGranted = attestationResult.valid;
      
      if (backendGranted !== attestationGranted) {
        return {
          granted: backendGranted, // Backend wins
          confidence: 'attestation_disagreed',
          sources,
          matchedRoles,
          requiredRoles,
          reason: backendResult.result.reason,
          discrepancy: {
            type: 'attestation',
            backendDecision: backendGranted,
            otherDecision: attestationGranted,
          },
        };
      }
      
      // Attestation corroborated
      return {
        granted: backendGranted,
        confidence: 'attestation_corroborated',
        sources,
        matchedRoles,
        requiredRoles,
        reason: backendResult.result.reason,
      };
    }

    // Backend succeeded, no corroboration available
    return {
      granted: backendGranted,
      confidence: 'backend_verified',
      sources,
      matchedRoles,
      requiredRoles,
      reason: backendResult.result.reason,
    };
  }

  // Backend failed or not provided
  if (requireBackend) {
    // Strict mode: deny if backend failed
    return {
      granted: false,
      confidence: 'all_sources_failed',
      sources,
      matchedRoles: [],
      requiredRoles: [],
      reason: backendResult
        ? `Backend check required but failed: ${backendResult.error ?? 'unknown error'}`
        : 'Backend check required but not provided',
    };
  }

  // Try RPC fallback
  if (allowRpcFallback && rpcResult?.success && rpcResult.resolvedRoles) {
    const rpcGranted = rpcResult.resolvedRoles.length > 0;
    
    return {
      granted: rpcGranted,
      confidence: backendResult ? 'backend_unavailable_rpc_verified' : 'partial_rpc_only',
      sources,
      matchedRoles: rpcResult.resolvedRoles,
      requiredRoles: [], // RPC doesn't provide required roles
      reason: rpcGranted ? 'Role verified via on-chain RPC' : 'No matching roles verified via on-chain RPC',
    };
  }

  // Try attestation fallback
  if (allowAttestationFallback && attestationResult?.success) {
    const attestationGranted = attestationResult.valid;
    const matchedRoles = attestationGranted
      ? (attestationResult.matchedRoles ?? ['attestation_verified'])
      : (attestationResult.matchedRoles ?? []);
    const requiredRoles = attestationResult.requiredRoles ?? [];
    
    return {
      granted: attestationGranted,
      confidence: backendResult ? 'backend_unavailable_attestation_verified' : 'partial_attestation_only',
      sources,
      matchedRoles,
      requiredRoles,
      reason: attestationGranted 
        ? 'Verified via cached attestation' 
        : attestationResult.error ?? 'Attestation verification failed',
    };
  }

  // All sources failed
  return {
    granted: false,
    confidence: 'all_sources_failed',
    sources,
    matchedRoles: [],
    requiredRoles: [],
    reason:
      backendResult && !backendResult.success
        ? backendResult.error
        : rpcResult && !rpcResult.success
          ? rpcResult.error
          : attestationResult?.error ?? 'All verification sources failed',
  };
}

/**
 * Helper function to get human-readable confidence label for UI display
 */
export function getConfidenceLabel(confidence: AccessDecisionConfidence): string {
  const labels: Record<AccessDecisionConfidence, string> = {
    backend_verified: 'Verified via server',
    backend_unavailable_rpc_verified: 'Verified via blockchain (server unavailable)',
    backend_unavailable_attestation_verified: 'Verified offline via attestation (server unavailable)',
    rpc_corroborated: 'Verified via server & blockchain',
    rpc_disagreed: 'Server & blockchain disagree - using server result',
    attestation_corroborated: 'Verified via server & attestation',
    attestation_disagreed: 'Server & attestation disagree - using server result',
    all_sources_failed: 'Unable to verify access',
    partial_rpc_only: 'Verified via blockchain only',
    partial_attestation_only: 'Verified offline via attestation only',
  };
  
  return labels[confidence];
}

/**
 * Helper function to determine if confidence level indicates a discrepancy
 */
export function isDiscrepancy(confidence: AccessDecisionConfidence): boolean {
  return confidence === 'rpc_disagreed' || confidence === 'attestation_disagreed';
}

/**
 * Helper function to determine if confidence level indicates offline verification
 */
export function isOfflineVerification(confidence: AccessDecisionConfidence): boolean {
  return (
    confidence === 'backend_unavailable_attestation_verified' ||
    confidence === 'partial_attestation_only'
  );
}

/**
 * Helper function to determine if confidence level indicates server unavailability
 */
export function isServerUnavailable(confidence: AccessDecisionConfidence): boolean {
  return (
    confidence === 'backend_unavailable_rpc_verified' ||
    confidence === 'backend_unavailable_attestation_verified'
  );
}
