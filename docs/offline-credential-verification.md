# Offline Credential Verification

## Overview

GuildPass Mobile can verify access while offline when the verifier has already synchronized the required credential material:

- a signed EIP-712 role attestation for the wallet and guild,
- the guild issuer key that signed the attestation,
- recent attestation issuer revocation data,
- and either cached access policy data or a direct resource credential whose role ID is `access-{resourceId}`.

The online backend remains authoritative. Offline verification is a bounded fallback for venues with unreliable connectivity, not a replacement for server validation.

## Verification Flow

1. The scanner verifies the access QR payload locally before navigation.
   Signed QR payloads use the QR issuer-key registry and its 15 minute TTL / 24 hour offline trust window.
2. The access-check screen warms persisted guild config and role catalog queries when a guild ID is present.
3. On submit:
   - Online: the app calls `checkAccess`; cached attestations may corroborate the result when available.
   - Offline: the app skips backend and RPC calls and evaluates cached attestations only.
4. The offline verifier:
   - resolves required roles from cached resource policy, guild policy, or `access-{resourceId}`,
   - loads cached attestations for the wallet and guild,
   - verifies attestation expiry, issuer revocation status, and EIP-712 signature,
   - applies the cached `any` or `all` access policy,
   - returns confidence and sync metadata for UI display.

## Revocation Sync

Attestation issuer revocation data is synchronized through two paths:

- `AttestationService.fetchAndVerifyAttestation()` can cache a backend-provided revocation registry during online credential fetches.
- Reconnect reconciliation refreshes cached guild config; when the returned config includes attestation revocation fields such as `revokedIssuerAddresses` or nested `attestationRevocationRegistry.revokedAddresses`, the sync fetcher updates the local revocation registry.

If revocation data is unavailable or outside the trust window, offline attestation verification fails closed.

## Trust Boundaries

- Backend validation is authoritative whenever it completes.
- Offline validation trusts only signed attestations whose issuer key and revocation registry are locally cached.
- Cached role names or cached membership status alone never grant offline access.
- Cached revocation data is trusted only within the attestation registry's 24 hour offline trust window.
- Local storage integrity protects against accidental corruption, not a fully compromised device.

## Failure Policy

| Condition | Offline result |
| --- | --- |
| No cached issuer key | Deny |
| No cached attestation | Deny |
| Missing revocation registry | Deny |
| Revocation registry past trust window | Deny |
| Expired attestation | Deny |
| Revoked issuer key | Deny |
| Valid attestation but missing required role | Deny |
| Valid matching attestation inside trust window | Grant with offline confidence |

## Attack Vectors

- Replay of old QR payloads: QR expiry, nonce replay protection, and signed payload verification limit reuse.
- Stale revocation data: trust windows cap how long offline verifiers can accept old registry snapshots.
- Compromised issuer key: once revocation data syncs, credentials from that key are rejected; before sync, the remaining exposure is bounded by the offline trust window.
- Tampered local cache: credential signatures are verified, and QR key registries include checksums. A fully compromised device remains outside the local trust boundary.
- Policy drift while offline: reconnect reconciliation refreshes membership, roles, guild config, and guild role catalogs, surfacing corrections for changed access state.

## Operational Limitations

- Verifiers should sync before opening an event gate.
- Direct resource credentials require the issuer to mint attestations with role ID `access-{resourceId}`.
- Role-policy verification requires the guild config and role catalog to have been cached previously.
- Offline grants should be treated as "pending server recheck" in high-risk venues.
- Long offline periods beyond the trust window require reconnecting before verification can continue.

## Key Code Paths

- Offline verifier: `src/features/access/offlineCredentialVerifier.ts`
- Access decision pipeline: `src/features/access/accessDecisionPipeline.ts`
- Access hook/UI integration: `src/features/access/useAccessCheck.ts`, `app/access-check.tsx`
- Attestation revocation cache: `src/features/attestation/issuerKeyRegistry.ts`
- Reconnect revocation sync: `src/features/sync/syncFetchers.ts`
