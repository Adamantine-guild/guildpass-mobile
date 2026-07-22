# Access Decision Pipeline Design Document

## Overview

This document specifies the unified decision policy for combining three independent access verification sources:

1. **Backend checkAccess** - Live server-side verification with full context
2. **RPC Fallback Resolver** - On-chain role eligibility verification via blockchain RPC
3. **EIP-712 Attestations** - Offline-verifiable cryptographic proofs

## Trust Model Comparison

| Source | Trust Level | Freshness | Offline Capability | Failure Mode |
|--------|-------------|-----------|-------------------|--------------|
| Backend | Highest (authoritative) | Real-time | No | Network/server error |
| RPC Fallback | Medium (on-chain truth) | Real-time | No | RPC timeout, unsupported requirement types |
| Attestation | Medium (cryptographic proof) | Static (expires) | Yes | Expired, revoked, signature invalid |

## Confidence Levels

The pipeline outputs one of the following confidence levels:

- **`backend_verified`** - Backend check succeeded. Highest confidence.
- **backend_unavailable_rpc_verified** - Backend failed, RPC succeeded. Medium-high confidence.
- **backend_unavailable_attestation_verified** - Backend failed, RPC failed/unavailable, attestation verified. Medium confidence (offline-capable).
- **rpc_corroborated** - Backend succeeded, RPC also succeeded and agrees. Highest confidence (cross-verified).
- **rpc_disagreed** - Backend and RPC both succeeded but disagree. Critical discrepancy.
- **attestation_corroborated** - Backend succeeded, attestation also verified and agrees. High confidence.
- **attestation_disagreed** - Backend succeeded, attestation verified but disagrees. Critical discrepancy.
- **all_sources_failed** - All verification sources failed. No access granted.
- **partial_rpc_only** - Only RPC succeeded (no backend result). Medium-high confidence.
- **partial_attestation_only** - Only attestation succeeded (no backend, no RPC). Medium confidence (offline-capable).

## Decision Policy

### Precedence Order

1. **Backend is authoritative when available** - The backend has full context including off-chain data, revocation status, and business logic that on-chain checks cannot replicate.
2. **RPC is a corroborating fallback** - When backend succeeds, RPC is consulted to corroborate. When backend fails, RPC can serve as a fallback for ROLE-type requirements.
3. **Attestations are an offline fallback** - When both backend and RPC are unavailable, attestations provide a verifiable proof that works offline, subject to expiry and revocation checks.

### Scenario Matrix

| Scenario | Backend | RPC | Attestation | Decision | Confidence |
|----------|---------|-----|-------------|----------|------------|
| All succeed and agree | ✅ | ✅ | ✅ | Grant | `rpc_corroborated` |
| All succeed, RPC disagrees | ✅ | ❌ | ✅ | Grant (backend wins) | `rpc_disagreed` (warning) |
| All succeed, attestation disagrees | ✅ | ✅ | ❌ | Grant (backend wins) | `attestation_disagreed` (warning) |
| Backend succeeds only | ✅ | ❌/N/A | ❌/N/A | Grant | `backend_verified` |
| Backend fails, RPC succeeds | ❌ | ✅ | ❌/N/A | Grant (ROLE only) | `backend_unavailable_rpc_verified` |
| Backend fails, RPC fails, attestation succeeds | ❌ | ❌ | ✅ | Grant | `backend_unavailable_attestation_verified` |
| Backend fails, RPC unavailable, attestation succeeds | ❌ | N/A | ✅ | Grant | `backend_unavailable_attestation_verified` |
| All fail | ❌ | ❌ | ❌ | Deny | `all_sources_failed` |
| Backend timeout, RPC succeeds | timeout | ✅ | ❌/N/A | Grant | `backend_unavailable_rpc_verified` |
| Backend timeout, attestation succeeds | timeout | ❌/N/A | ✅ | Grant | `backend_unavailable_attestation_verified` |

### Disagreement Handling

**Critical discrepancies** (loud, visible UI treatment):
- `rpc_disagreed` - Backend and RPC both succeeded but returned different access decisions
- `attestation_disagreed` - Backend and attestation both verified but disagree on access

These scenarios trigger:
- Visual warning banner in the UI
- Detailed discrepancy information in the access result
- Logging for backend investigation
- Recommendation to retry or contact support

### Partial Availability Handling

**Backend down, RPC available:**
- Proceed with RPC result for ROLE-type requirements only
- Mark confidence as `backend_unavailable_rpc_verified`
- UI shows "Verified via blockchain (server unavailable)"

**Backend down, only attestation available:**
- Proceed with attestation if valid and not expired
- Mark confidence as `backend_unavailable_attestation_verified`
- UI shows "Verified offline via attestation (server unavailable)"
- Require biometric authentication to display result (already implemented)

**Backend down, RPC unavailable, attestation available:**
- Same as above - attestation is the only viable proof

**Backend down, all sources unavailable:**
- Deny access with confidence `all_sources_failed`
- UI shows "Unable to verify access - all verification sources unavailable"

### Offline Scenarios

**No connectivity, cached attestation available:**
- Verify attestation locally using cached issuer key
- Check revocation status using cached revocation registry
- If revocation data unavailable, FAIL CLOSED (reject attestation)
- On success: confidence `backend_unavailable_attestation_verified`
- UI shows "Verified offline via attestation, unconfirmed with server"

**No connectivity, no cached attestation:**
- Deny access with confidence `all_sources_failed`
- UI shows "Offline verification requires cached attestation"

## Implementation Specification

### Function Signature

```typescript
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

export type AccessDecisionResult = {
  granted: boolean;
  confidence: AccessDecisionConfidence;
  sources: {
    backend?: { success: boolean; result?: AccessCheckResult; error?: string };
    rpc?: { success: boolean; resolvedRoles?: string[]; error?: string };
    attestation?: { success: boolean; valid: boolean; error?: string };
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

export async function resolveAccessDecision(params: {
  walletAddress: string;
  guildId: string;
  resourceId: string;
  backendCheck?: () => Promise<AccessCheckResult>;
  rpcResolver?: () => Promise<PerChainRoleEligibilityResolution[]>;
  attestationVerifier?: () => Promise<boolean>;
  options?: {
    requireBackend?: boolean; // If true, deny if backend fails regardless of fallbacks
    allowRpcFallback?: boolean; // Default: true
    allowAttestationFallback?: boolean; // Default: true
  };
}): Promise<AccessDecisionResult>;
```

### Execution Flow

1. **Execute all sources in parallel** (where available)
   - Backend check (if provided)
   - RPC resolver (if provided)
   - Attestation verifier (if provided)

2. **Wait for backend result** (primary source)
   - If backend succeeds: use as baseline decision
   - If backend fails: evaluate fallbacks

3. **Corroborate with RPC** (if backend succeeded and RPC available)
   - Compare backend decision with RPC resolved roles
   - Mark as `rpc_corroborated` or `rpc_disagreed`

4. **Corroborate with attestation** (if backend succeeded and attestation available)
   - Compare backend decision with attestation validity
   - Mark as `attestation_corroborated` or `attestation_disagreed`

5. **Apply fallback logic** (if backend failed)
   - Try RPC if available and allowed
   - Try attestation if RPC failed/unavailable and allowed
   - If all fail: deny with `all_sources_failed`

6. **Return unified decision** with confidence level and provenance

### Error Handling

- **Backend timeout**: Treat as failure, proceed to fallbacks
- **RPC timeout**: Treat as failure for that chain, other chains may succeed
- **RPC unsupported requirement**: Treat as failure, proceed to attestation
- **Attestation expired**: Treat as failure
- **Attestation revoked**: Treat as failure
- **Attestation revocation data unavailable**: FAIL CLOSED, treat as failure

## UI Treatment

### Confidence Level Display

| Confidence | UI Label | Visual Treatment | Authentication Required |
|------------|----------|------------------|------------------------|
| `backend_verified` | "Verified via server" | Green checkmark, standard | Yes (biometric) |
| `rpc_corroborated` | "Verified via server & blockchain" | Green checkmark with shield icon | Yes (biometric) |
| `attestation_corroborated` | "Verified via server & attestation" | Green checkmark with lock icon | Yes (biometric) |
| `backend_unavailable_rpc_verified` | "Verified via blockchain (server unavailable)" | Amber checkmark with warning | Yes (biometric) |
| `backend_unavailable_attestation_verified` | "Verified offline via attestation (server unavailable)" | Amber checkmark with lock icon | Yes (biometric) |
| `partial_rpc_only` | "Verified via blockchain only" | Amber checkmark | Yes (biometric) |
| `partial_attestation_only` | "Verified offline via attestation only" | Amber checkmark with lock icon | Yes (biometric) |
| `rpc_disagreed` | "Server & blockchain disagree - using server result" | Red warning banner | Yes (biometric) |
| `attestation_disagreed` | "Server & attestation disagree - using server result" | Red warning banner | Yes (biometric) |
| `all_sources_failed` | "Unable to verify access" | Red X | N/A |

### Discrepancy Banner

For `rpc_disagreed` and `attestation_disagreed`:

```
⚠️ Verification Discrepancy Detected
Server granted access but blockchain/attestation verification disagreed.
This may indicate a configuration issue. Please contact support if this persists.
```

### Offline Indicator

When confidence includes "offline" or "server unavailable":

```
📴 Offline Mode
Access verified using cached data. Server confirmation pending.
```

## Testing Scenarios

### Unit Test Cases

1. **All sources succeed and agree** → `rpc_corroborated`
2. **Backend succeeds, RPC disagrees** → `rpc_disagreed` with warning
3. **Backend succeeds, attestation disagrees** → `attestation_disagreed` with warning
4. **Backend succeeds only** → `backend_verified`
5. **Backend fails, RPC succeeds** → `backend_unavailable_rpc_verified`
6. **Backend fails, RPC fails, attestation succeeds** → `backend_unavailable_attestation_verified`
7. **Backend timeout, RPC succeeds** → `backend_unavailable_rpc_verified`
8. **Backend timeout, attestation succeeds** → `backend_unavailable_attestation_verified`
9. **All sources fail** → `all_sources_failed`
10. **No backend provided, RPC succeeds** → `partial_rpc_only`
11. **No backend provided, attestation succeeds** → `partial_attestation_only`
12. **Attestation expired** → treated as failure
13. **Attestation revoked** → treated as failure
14. **Attestation revocation data unavailable** → FAIL CLOSED

### Integration Test Scenarios

1. **Event with no connectivity** - Backend down, cached attestation available
2. **RPC endpoint failure** - Backend succeeds, RPC times out
3. **Configuration mismatch** - Backend and RPC disagree on role eligibility
4. **Key rotation** - Attestation signed by now-revoked key
5. **Expired attestation** - Offline verification of expired proof

## Migration Strategy

### Phase 1: Implementation
- Create `resolveAccessDecision()` function in `src/features/access/accessDecisionPipeline.ts`
- Write comprehensive unit tests
- No changes to existing UI or hooks

### Phase 2: Integration
- Create new hook `useAccessDecision()` that wraps `resolveAccessDecision()`
- Add to `access-check.tsx` as an alternative implementation (feature flag)
- Test in staging environment

### Phase 3: Rollout
- Monitor discrepancy rates in production
- Gradually roll out to users
- Deprecate old `useAccessCheck` after validation

## Security Considerations

1. **Fail closed for revocation** - Attestations are rejected if revocation status cannot be verified
2. **Biometric gate** - All access results require biometric authentication (already implemented)
3. **Discrepancy logging** - All disagreements are logged for security monitoring
4. **Attestation expiry** - Expired attestations are never accepted
5. **RPC limitation** - RPC fallback only works for ROLE-type requirements (enforced in resolver)

## Future Enhancements

1. **Configurable policy** - Allow guild admins to customize fallback behavior
2. **Confidence thresholds** - Allow requiring minimum confidence for high-security resources
3. **Discrepancy auto-report** - Automatically report discrepancies to backend for investigation
4. **Attestation refresh** - Proactively refresh attestations when online to extend offline capability
