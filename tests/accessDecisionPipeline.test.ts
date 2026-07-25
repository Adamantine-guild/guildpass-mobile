/**
 * Access Decision Pipeline – unit tests
 *
 * Tests the unified decision policy for combining three access verification sources:
 * 1. Backend checkAccess (authoritative when available)
 * 2. RPC Fallback Resolver (on-chain role eligibility)
 * 3. EIP-712 Attestations (offline-verifiable proofs)
 *
 * See docs/access-decision-pipeline.md for the full decision policy.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  resolveAccessDecision,
  getConfidenceLabel,
  isDiscrepancy,
  isOfflineVerification,
  isServerUnavailable,
  type AccessDecisionConfidence,
} from "../src/features/access/accessDecisionPipeline";
import type { AccessCheckResult } from "../src/features/access/useAccessCheck";
import type { PerChainRoleEligibilityResolution } from "../src/features/access/roleEligibilityResolver";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ACCESS_GRANTED_FIXTURE: AccessCheckResult = {
  hasAccess: true,
  matchedRoles: ["role-1", "role-2"],
  requiredRoles: ["role-1", "role-2"],
  reason: "Access granted via role-1",
};

const ACCESS_DENIED_FIXTURE: AccessCheckResult = {
  hasAccess: false,
  matchedRoles: [],
  requiredRoles: ["role-1"],
  reason: "No matching roles found",
};

const RPC_SUCCESS_RESOLUTION: PerChainRoleEligibilityResolution[] = [
  {
    chainId: 1,
    status: "resolved",
    resolvedRoles: ["role-1"],
  },
];

const RPC_EMPTY_RESOLUTION: PerChainRoleEligibilityResolution[] = [
  {
    chainId: 1,
    status: "resolved",
    resolvedRoles: [],
  },
];

const BASE_PARAMS = {
  walletAddress: "0x1234567890123456789012345678901234567890",
  guildId: "test-guild",
  resourceId: "test-resource",
};

// ---------------------------------------------------------------------------
// Helper functions tests
// ---------------------------------------------------------------------------

describe("Access Decision Pipeline – helper functions", () => {
  it("getConfidenceLabel returns human-readable labels", () => {
    expect(getConfidenceLabel("backend_verified")).toBe("Verified via server");
    expect(getConfidenceLabel("backend_unavailable_rpc_verified")).toBe("Verified via blockchain (server unavailable)");
    expect(getConfidenceLabel("backend_unavailable_attestation_verified")).toBe("Verified offline via attestation (server unavailable)");
    expect(getConfidenceLabel("rpc_corroborated")).toBe("Verified via server & blockchain");
    expect(getConfidenceLabel("rpc_disagreed")).toBe("Server & blockchain disagree - using server result");
    expect(getConfidenceLabel("attestation_corroborated")).toBe("Verified via server & attestation");
    expect(getConfidenceLabel("attestation_disagreed")).toBe("Server & attestation disagree - using server result");
    expect(getConfidenceLabel("all_sources_failed")).toBe("Unable to verify access");
    expect(getConfidenceLabel("partial_rpc_only")).toBe("Verified via blockchain only");
    expect(getConfidenceLabel("partial_attestation_only")).toBe("Verified offline via attestation only");
  });

  it("isDiscrepancy identifies discrepancy confidence levels", () => {
    expect(isDiscrepancy("rpc_disagreed")).toBe(true);
    expect(isDiscrepancy("attestation_disagreed")).toBe(true);
    expect(isDiscrepancy("backend_verified")).toBe(false);
    expect(isDiscrepancy("rpc_corroborated")).toBe(false);
  });

  it("isOfflineVerification identifies offline verification confidence levels", () => {
    expect(isOfflineVerification("backend_unavailable_attestation_verified")).toBe(true);
    expect(isOfflineVerification("partial_attestation_only")).toBe(true);
    expect(isOfflineVerification("backend_verified")).toBe(false);
    expect(isOfflineVerification("backend_unavailable_rpc_verified")).toBe(false);
  });

  it("isServerUnavailable identifies server unavailable confidence levels", () => {
    expect(isServerUnavailable("backend_unavailable_rpc_verified")).toBe(true);
    expect(isServerUnavailable("backend_unavailable_attestation_verified")).toBe(true);
    expect(isServerUnavailable("backend_verified")).toBe(false);
    expect(isServerUnavailable("partial_attestation_only")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// All sources succeed and agree
// ---------------------------------------------------------------------------

describe("Access Decision Pipeline – all sources succeed and agree", () => {
  it("returns rpc_corroborated when backend and RPC both grant access", async () => {
    const result = await resolveAccessDecision({
      ...BASE_PARAMS,
      backendCheck: async () => ACCESS_GRANTED_FIXTURE,
      rpcResolver: async () => RPC_SUCCESS_RESOLUTION,
      attestationVerifier: async () => ({ valid: true }),
    });

    expect(result.granted).toBe(true);
    expect(result.confidence).toBe("rpc_corroborated");
    expect(result.matchedRoles).toEqual(ACCESS_GRANTED_FIXTURE.matchedRoles);
    expect(result.requiredRoles).toEqual(ACCESS_GRANTED_FIXTURE.requiredRoles);
    expect(result.sources.backend?.success).toBe(true);
    expect(result.sources.rpc?.success).toBe(true);
    expect(result.sources.attestation?.success).toBe(true);
    expect(result.discrepancy).toBeUndefined();
  });

  it("returns rpc_corroborated when backend and RPC both deny access", async () => {
    const result = await resolveAccessDecision({
      ...BASE_PARAMS,
      backendCheck: async () => ACCESS_DENIED_FIXTURE,
      rpcResolver: async () => RPC_EMPTY_RESOLUTION,
      attestationVerifier: async () => ({ valid: false }),
    });

    expect(result.granted).toBe(false);
    expect(result.confidence).toBe("rpc_corroborated");
    expect(result.matchedRoles).toEqual([]);
    expect(result.discrepancy).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Disagreement scenarios
// ---------------------------------------------------------------------------

describe("Access Decision Pipeline – disagreement scenarios", () => {
  it("returns rpc_disagreed when backend grants but RPC denies", async () => {
    const result = await resolveAccessDecision({
      ...BASE_PARAMS,
      backendCheck: async () => ACCESS_GRANTED_FIXTURE,
      rpcResolver: async () => RPC_EMPTY_RESOLUTION,
    });

    expect(result.granted).toBe(true); // Backend wins
    expect(result.confidence).toBe("rpc_disagreed");
    expect(result.discrepancy).toEqual({
      type: "rpc",
      backendDecision: true,
      otherDecision: false,
    });
  });

  it("returns rpc_disagreed when backend denies but RPC grants", async () => {
    const result = await resolveAccessDecision({
      ...BASE_PARAMS,
      backendCheck: async () => ACCESS_DENIED_FIXTURE,
      rpcResolver: async () => RPC_SUCCESS_RESOLUTION,
    });

    expect(result.granted).toBe(false); // Backend wins
    expect(result.confidence).toBe("rpc_disagreed");
    expect(result.discrepancy).toEqual({
      type: "rpc",
      backendDecision: false,
      otherDecision: true,
    });
  });

  it("returns attestation_disagreed when backend grants but attestation invalid", async () => {
    const result = await resolveAccessDecision({
      ...BASE_PARAMS,
      backendCheck: async () => ACCESS_GRANTED_FIXTURE,
      attestationVerifier: async () => ({ valid: false, error: "Signature invalid" }),
    });

    expect(result.granted).toBe(true); // Backend wins
    expect(result.confidence).toBe("attestation_disagreed");
    expect(result.discrepancy).toEqual({
      type: "attestation",
      backendDecision: true,
      otherDecision: false,
    });
  });

  it("returns attestation_disagreed when backend denies but attestation valid", async () => {
    const result = await resolveAccessDecision({
      ...BASE_PARAMS,
      backendCheck: async () => ACCESS_DENIED_FIXTURE,
      attestationVerifier: async () => ({ valid: true }),
    });

    expect(result.granted).toBe(false); // Backend wins
    expect(result.confidence).toBe("attestation_disagreed");
    expect(result.discrepancy).toEqual({
      type: "attestation",
      backendDecision: false,
      otherDecision: true,
    });
  });
});

// ---------------------------------------------------------------------------
// Backend succeeds only
// ---------------------------------------------------------------------------

describe("Access Decision Pipeline – backend succeeds only", () => {
  it("returns backend_verified when only backend succeeds", async () => {
    const result = await resolveAccessDecision({
      ...BASE_PARAMS,
      backendCheck: async () => ACCESS_GRANTED_FIXTURE,
    });

    expect(result.granted).toBe(true);
    expect(result.confidence).toBe("backend_verified");
    expect(result.matchedRoles).toEqual(ACCESS_GRANTED_FIXTURE.matchedRoles);
    expect(result.requiredRoles).toEqual(ACCESS_GRANTED_FIXTURE.requiredRoles);
    expect(result.sources.backend?.success).toBe(true);
    expect(result.sources.rpc).toBeUndefined();
    expect(result.sources.attestation).toBeUndefined();
  });

  it("returns backend_verified when backend succeeds and RPC fails", async () => {
    const result = await resolveAccessDecision({
      ...BASE_PARAMS,
      backendCheck: async () => ACCESS_GRANTED_FIXTURE,
      rpcResolver: async () => {
        throw new Error("RPC timeout");
      },
    });

    expect(result.granted).toBe(true);
    expect(result.confidence).toBe("backend_verified");
    expect(result.sources.backend?.success).toBe(true);
    expect(result.sources.rpc?.success).toBe(false);
  });

  it("returns backend_verified when backend succeeds and attestation fails", async () => {
    const result = await resolveAccessDecision({
      ...BASE_PARAMS,
      backendCheck: async () => ACCESS_GRANTED_FIXTURE,
      attestationVerifier: async () => {
        throw new Error("Attestation expired");
      },
    });

    expect(result.granted).toBe(true);
    expect(result.confidence).toBe("backend_verified");
    expect(result.sources.backend?.success).toBe(true);
    expect(result.sources.attestation?.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Backend fails, RPC fallback
// ---------------------------------------------------------------------------

describe("Access Decision Pipeline – backend fails, RPC fallback", () => {
  it("returns backend_unavailable_rpc_verified when backend fails and RPC grants", async () => {
    const result = await resolveAccessDecision({
      ...BASE_PARAMS,
      backendCheck: async () => {
        throw new Error("Backend timeout");
      },
      rpcResolver: async () => RPC_SUCCESS_RESOLUTION,
    });

    expect(result.granted).toBe(true);
    expect(result.confidence).toBe("backend_unavailable_rpc_verified");
    expect(result.matchedRoles).toEqual(["role-1"]);
    expect(result.sources.backend?.success).toBe(false);
    expect(result.sources.rpc?.success).toBe(true);
  });

  it("returns backend_unavailable_rpc_verified when backend fails and RPC denies", async () => {
    const result = await resolveAccessDecision({
      ...BASE_PARAMS,
      backendCheck: async () => {
        throw new Error("Backend timeout");
      },
      rpcResolver: async () => RPC_EMPTY_RESOLUTION,
    });

    expect(result.granted).toBe(false);
    expect(result.confidence).toBe("backend_unavailable_rpc_verified");
    expect(result.matchedRoles).toEqual([]);
    expect(result.sources.backend?.success).toBe(false);
    expect(result.sources.rpc?.success).toBe(true);
  });

  it("does not use RPC fallback when allowRpcFallback is false", async () => {
    const result = await resolveAccessDecision({
      ...BASE_PARAMS,
      backendCheck: async () => {
        throw new Error("Backend timeout");
      },
      rpcResolver: async () => RPC_SUCCESS_RESOLUTION,
      options: { allowRpcFallback: false },
    });

    expect(result.granted).toBe(false);
    expect(result.confidence).toBe("all_sources_failed");
    expect(result.sources.rpc?.success).toBe(true); // RPC succeeded but not used
  });
});

// ---------------------------------------------------------------------------
// Backend fails, attestation fallback
// ---------------------------------------------------------------------------

describe("Access Decision Pipeline – backend fails, attestation fallback", () => {
  it("returns backend_unavailable_attestation_verified when backend and RPC fail, attestation valid", async () => {
    const result = await resolveAccessDecision({
      ...BASE_PARAMS,
      backendCheck: async () => {
        throw new Error("Backend timeout");
      },
      rpcResolver: async () => {
        throw new Error("RPC timeout");
      },
      attestationVerifier: async () => ({ valid: true }),
    });

    expect(result.granted).toBe(true);
    expect(result.confidence).toBe("backend_unavailable_attestation_verified");
    expect(result.matchedRoles).toEqual(["attestation_verified"]);
    expect(result.sources.backend?.success).toBe(false);
    expect(result.sources.rpc?.success).toBe(false);
    expect(result.sources.attestation?.success).toBe(true);
    expect(result.sources.attestation?.valid).toBe(true);
  });

  it("returns backend_unavailable_attestation_verified when backend fails, attestation invalid", async () => {
    const result = await resolveAccessDecision({
      ...BASE_PARAMS,
      backendCheck: async () => {
        throw new Error("Backend timeout");
      },
      attestationVerifier: async () => ({ valid: false, error: "Signature invalid" }),
    });

    expect(result.granted).toBe(false);
    expect(result.confidence).toBe("backend_unavailable_attestation_verified");
    expect(result.matchedRoles).toEqual([]);
    expect(result.sources.attestation?.valid).toBe(false);
  });

  it("does not use attestation fallback when allowAttestationFallback is false", async () => {
    const result = await resolveAccessDecision({
      ...BASE_PARAMS,
      backendCheck: async () => {
        throw new Error("Backend timeout");
      },
      attestationVerifier: async () => ({ valid: true }),
      options: { allowAttestationFallback: false },
    });

    expect(result.granted).toBe(false);
    expect(result.confidence).toBe("all_sources_failed");
  });
});

// ---------------------------------------------------------------------------
// All sources fail
// ---------------------------------------------------------------------------

describe("Access Decision Pipeline – all sources fail", () => {
  it("returns all_sources_failed when all sources fail", async () => {
    const result = await resolveAccessDecision({
      ...BASE_PARAMS,
      backendCheck: async () => {
        throw new Error("Backend timeout");
      },
      rpcResolver: async () => {
        throw new Error("RPC timeout");
      },
      attestationVerifier: async () => {
        throw new Error("Attestation expired");
      },
    });

    expect(result.granted).toBe(false);
    expect(result.confidence).toBe("all_sources_failed");
    expect(result.sources.backend?.success).toBe(false);
    expect(result.sources.rpc?.success).toBe(false);
    expect(result.sources.attestation?.success).toBe(false);
  });

  it("returns all_sources_failed when backend fails and no fallbacks provided", async () => {
    const result = await resolveAccessDecision({
      ...BASE_PARAMS,
      backendCheck: async () => {
        throw new Error("Backend timeout");
      },
    });

    expect(result.granted).toBe(false);
    expect(result.confidence).toBe("all_sources_failed");
  });
});

// ---------------------------------------------------------------------------
// Partial availability (no backend)
// ---------------------------------------------------------------------------

describe("Access Decision Pipeline – partial availability (no backend)", () => {
  it("returns partial_rpc_only when only RPC provided and succeeds", async () => {
    const result = await resolveAccessDecision({
      ...BASE_PARAMS,
      rpcResolver: async () => RPC_SUCCESS_RESOLUTION,
    });

    expect(result.granted).toBe(true);
    expect(result.confidence).toBe("partial_rpc_only");
    expect(result.matchedRoles).toEqual(["role-1"]);
    expect(result.sources.backend).toBeUndefined();
    expect(result.sources.rpc?.success).toBe(true);
  });

  it("returns partial_attestation_only when only attestation provided and succeeds", async () => {
    const result = await resolveAccessDecision({
      ...BASE_PARAMS,
      attestationVerifier: async () => ({ valid: true }),
    });

    expect(result.granted).toBe(true);
    expect(result.confidence).toBe("partial_attestation_only");
    expect(result.matchedRoles).toEqual(["attestation_verified"]);
    expect(result.sources.backend).toBeUndefined();
    expect(result.sources.attestation?.success).toBe(true);
  });

  it("returns all_sources_failed when only RPC provided and fails", async () => {
    const result = await resolveAccessDecision({
      ...BASE_PARAMS,
      rpcResolver: async () => {
        throw new Error("RPC timeout");
      },
    });

    expect(result.granted).toBe(false);
    expect(result.confidence).toBe("all_sources_failed");
  });
});

// ---------------------------------------------------------------------------
// Strict mode (requireBackend)
// ---------------------------------------------------------------------------

describe("Access Decision Pipeline – strict mode (requireBackend)", () => {
  it("denies access when requireBackend is true and backend fails", async () => {
    const result = await resolveAccessDecision({
      ...BASE_PARAMS,
      backendCheck: async () => {
        throw new Error("Backend timeout");
      },
      rpcResolver: async () => RPC_SUCCESS_RESOLUTION,
      attestationVerifier: async () => ({ valid: true }),
      options: { requireBackend: true },
    });

    expect(result.granted).toBe(false);
    expect(result.confidence).toBe("all_sources_failed");
    expect(result.reason).toContain("Backend check required");
  });

  it("denies access when requireBackend is true and backend not provided", async () => {
    const result = await resolveAccessDecision({
      ...BASE_PARAMS,
      rpcResolver: async () => RPC_SUCCESS_RESOLUTION,
      options: { requireBackend: true },
    });

    expect(result.granted).toBe(false);
    expect(result.confidence).toBe("all_sources_failed");
    expect(result.reason).toContain("Backend check required");
  });
});

// ---------------------------------------------------------------------------
// Corroboration scenarios
// ---------------------------------------------------------------------------

describe("Access Decision Pipeline – corroboration scenarios", () => {
  it("returns attestation_corroborated when backend and attestation agree", async () => {
    const result = await resolveAccessDecision({
      ...BASE_PARAMS,
      backendCheck: async () => ACCESS_GRANTED_FIXTURE,
      attestationVerifier: async () => ({ valid: true }),
    });

    expect(result.granted).toBe(true);
    expect(result.confidence).toBe("attestation_corroborated");
    expect(result.discrepancy).toBeUndefined();
  });

  it("prioritizes RPC corroboration over attestation when both available", async () => {
    const result = await resolveAccessDecision({
      ...BASE_PARAMS,
      backendCheck: async () => ACCESS_GRANTED_FIXTURE,
      rpcResolver: async () => RPC_SUCCESS_RESOLUTION,
      attestationVerifier: async () => ({ valid: true }),
    });

    expect(result.confidence).toBe("rpc_corroborated");
  });
});

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------

describe("Access Decision Pipeline – error handling", () => {
  it("captures backend error message", async () => {
    const result = await resolveAccessDecision({
      ...BASE_PARAMS,
      backendCheck: async () => {
        throw new Error("Backend unavailable");
      },
    });

    expect(result.sources.backend?.error).toBe("Backend unavailable");
    expect(result.reason).toContain("Backend unavailable");
  });

  it("captures RPC error message", async () => {
    const result = await resolveAccessDecision({
      ...BASE_PARAMS,
      backendCheck: async () => {
        throw new Error("Backend unavailable");
      },
      rpcResolver: async () => {
        throw new Error("RPC endpoint timeout");
      },
    });

    expect(result.sources.rpc?.error).toBe("RPC endpoint timeout");
  });

  it("captures attestation error message", async () => {
    const result = await resolveAccessDecision({
      ...BASE_PARAMS,
      backendCheck: async () => {
        throw new Error("Backend unavailable");
      },
      attestationVerifier: async () => ({ valid: false, error: "Signature invalid" }),
    });

    expect(result.sources.attestation?.error).toBe("Signature invalid");
  });

  it("handles non-Error errors gracefully", async () => {
    const result = await resolveAccessDecision({
      ...BASE_PARAMS,
      backendCheck: async () => {
        throw "String error";
      },
    });

    expect(result.sources.backend?.error).toBe("String error");
  });
});
