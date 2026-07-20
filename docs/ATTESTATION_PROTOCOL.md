# EIP-712 Role Attestation Protocol

## Overview

This document specifies the GuildPass EIP-712 Role Attestation Protocol, which enables cryptographically verifiable, user-portable proofs of role membership. This protocol allows wallet holders to present verifiable evidence of their roles to third parties, without requiring live backend availability.

## Motivation

Current role verification relies on backend API assertions:
- **Trust Model**: Trusting the backend's honesty at query time
- **Availability**: Requires live network connectivity to the GuildPass backend
- **Portability**: Role proofs are not portable - cannot be presented to third parties without backend intervention
- **Privacy**: Backend knows when and where roles are being verified

EIP-712 attestations address these limitations by:
- **Cryptographic Verification**: Mathematically proves a guild's issuer approved the role claim
- **Offline Verification**: Works entirely offline once cached (airplane mode compatible)
- **Portability**: Can be presented to any verifier with the issuer public key
- **Privacy**: Verification requires no backend communication

## Architecture

### Components

```
┌─────────────────────────────────────────────┐
│        Mobile App (GuildPass)               │
├─────────────────────────────────────────────┤
│  ┌────────────────────────────────────────┐ │
│  │  Attestation Verification Layer        │ │
│  │  (verifySignature.ts)                  │ │
│  └────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────┐ │
│  │  Attestation Service                   │ │
│  │  (attestationService.ts)               │ │
│  └────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────┐ │
│  │  Storage Layer                         │ │
│  │  ├── Attestation Cache                 │ │
│  │  │   (attestationStorage.ts)           │ │
│  │  └── Issuer Key Cache                  │ │
│  │      (issuerKeyRegistry.ts)            │ │
│  └────────────────────────────────────────┘ │
└─────────────────────────────────────────────┘
         ↑                          ↓
    SDK API Calls          Cached Data (AsyncStorage)
```

### Data Flow

```
1. Request Attestation
   App → Backend (via SDK) → Get RoleAttestation signed by guild issuer

2. Verify & Cache
   App → Verify signature with cached issuer key
   App → Cache attestation for offline use

3. Offline Verification
   App → Can verify cached attestation + cached issuer key
   No network required
```

## Protocol Specification

### EIP-712 Domain

```javascript
{
  name: "GuildPass",
  version: "1.0",
  chainId: <blockchain-id>,
  verifyingContract: "0x0000000000000000000000000000000000000000"
}
```

The `verifyingContract` is a null address for now, as attestations are currently off-chain. This prevents accidental on-chain replay attacks.

### Message Type

```javascript
RoleAttestation: [
  { name: 'guildId', type: 'string' },
  { name: 'roleId', type: 'string' },
  { name: 'wallet', type: 'address' },
  { name: 'issuedAt', type: 'uint256' },
  { name: 'expiresAt', type: 'uint256' }
]
```

### Attestation Structure

```typescript
interface RoleAttestation {
  guildId: string;           // Guild identifier
  roleId: string;            // Role identifier
  wallet: '0x${string}';     // Holder's Ethereum address
  issuedAt: number;          // Unix timestamp (seconds)
  expiresAt: number;         // Unix timestamp (seconds)
  signature: '0x${string}';  // EIP-191 personal_sign or EIP-712 signature
}
```

### Issuer Key Registration

Guilds register their issuer key on-chain (implementation dependent on GuildPass protocol):

```typescript
interface GuildIssuerKey {
  guildId: string;
  issuerAddress: '0x${string}';
  registeredAt: number;         // When registered on-chain
  cachedAt: number;             // When cached locally (ms)
}
```

**Key Rotation**: When a guild rotates its issuer key:
1. New key is registered on-chain
2. Mobile app cache is automatically invalidated (7 day TTL by default)
3. App fetches new key from backend on next verification
4. Old attestations signed by previous key remain valid until expiration (signature verification works for any registered key)

## Verification Process

### Online Verification (with backend)

```
1. Fetch attestation from backend
   - walletAddress, guildId, roleId → RoleAttestation

2. Fetch issuer key (cached or fresh)
   - If cache miss: fetch from backend
   - Cache locally for 7 days

3. Verify signature
   - Use viem's verifyTypedData
   - Recover signer from signature
   - Compare to issuer address

4. Check expiration
   - Current time < attestation.expiresAt

5. Cache result
   - Store attestation in local AsyncStorage
   - Store validation result
```

### Offline Verification (cached)

```
1. Load attestation from local cache
   - If not found: fail (requires online fetch first)

2. Load issuer key from cache
   - If not found: fail (requires online fetch first)

3. Verify signature locally
   - Use cached issuer key
   - No network required

4. Check expiration
   - Current time < attestation.expiresAt

5. Return result
```

### Error Cases

| Scenario | Behavior |
|----------|----------|
| Invalid signature | Rejected, not cached |
| Expired attestation | Rejected, removed from cache if cached |
| Missing issuer key (offline) | Fails with "Issuer key not cached - requires online fetch" |
| Network error fetching attestation | Returns cached version if available |
| Network error fetching issuer key | Uses cached key if available, otherwise fails |
| Tampered attestation | Rejected during signature verification |

## Security Considerations

### Signature Verification

- Uses EIP-712 typed data to prevent phishing attacks
- Domain separation prevents cross-app/cross-chain replay
- All message fields are included in the signature hash

### Expiration Handling

- Attestations must be checked against current time
- Clock skew handling: consider removing attestations that are >1 hour past expiration
- Front-end should refresh attestations approaching expiration

### Issuer Key Management

- Issuer keys are public data (address only)
- Keys are cached locally for 7 days max
- Manual refresh available after guild admin key rotation
- Expired cache invalidates automatically

### Cache Security

- Attestations stored in AsyncStorage (Expo Secure Store for sensitive data recommended)
- Cache is per-wallet-address (no cross-wallet data leakage)
- No private keys stored
- User can clear cache anytime

### Offline Limitations

- Offline verification only works with cached data
- Cannot verify new attestations without network
- Cannot fetch new issuer keys offline
- Cannot update expiration checks without current time

## Integration Guide

### 1. Initialize Attestation Service

```typescript
import { AttestationService } from '@/features/attestation/attestationService';
import { guildPassClient } from '@/lib/guildpassClient';

const attestationService = new AttestationService({
  chainId: 1, // Ethereum mainnet
  fetchIssuerKey: (guildId) => 
    guildPassClient.attestation.getIssuerKey(guildId),
  fetchAttestation: (params) =>
    guildPassClient.attestation.getAttestation(params),
});
```

### 2. Use in Components

```typescript
import { useAttestationVerification } from '@/features/attestation/useAttestations';

function RoleDisplay({ walletAddress, guildId, roleId }) {
  const { data, isLoading, error } = useAttestationVerification(
    attestationService,
    walletAddress,
    guildId,
    roleId
  );

  if (error) return <div>Failed: {error}</div>;
  if (isLoading) return <div>Loading attestation...</div>;
  
  if (data?.valid) {
    return <div>
      ✓ Role verified {data.validityStatus}
    </div>;
  }
  
  return <div>Role not verified: {data?.error}</div>;
}
```

### 3. Offline Verification

```typescript
// Check if can verify offline (both attestation and issuer key cached)
const { data: canVerifyOffline } = useCachedAttestationExists(
  attestationService,
  walletAddress,
  guildId,
  roleId
);

// Verify offline (no network required)
const { data: result } = useLocalAttestationVerification(
  attestationService,
  walletAddress,
  guildId,
  roleId
);
```

### 4. Handling Key Rotation

```typescript
const refreshKeyMutation = useRefreshIssuerKey(attestationService);

const onGuildKeyRotation = async (guildId: string) => {
  await refreshKeyMutation.mutateAsync(guildId);
  // Re-verify all attestations for this guild
};
```

## Testing Strategy

### Unit Tests

- ✓ Signature verification (valid, tampered, invalid)
- ✓ Expiration checking
- ✓ Storage and retrieval
- ✓ Cache invalidation
- ✓ Error handling

### Integration Tests

- [ ] End-to-end: fetch → verify → cache → offline verify
- [ ] Key rotation scenarios
- [ ] Concurrent requests handling
- [ ] Storage persistence across app restarts
- [ ] Network failure recovery

### Security Tests

- [ ] Signature tampering detection
- [ ] Cross-wallet data isolation
- [ ] Cache poisoning attempts
- [ ] Replay attack prevention
- [ ] Expiration boundary conditions

## Future Enhancements

### On-Chain Attestations

- Upgrade to on-chain signed attestations if needed
- Use `verifyingContract` pointing to smart contract
- Enable trustless verification without issuer key cache

### Attestation Revocation

- Support revocation lists (CRLs) or OSCP-like mechanism
- Allow immediate invalidation of compromised attestations

### Multi-Key Support

- Support multiple issuer keys per guild
- Enable smooth key rotation without cache invalidation

### Attestation Delegation

- Allow role holders to create delegation proofs
- Sub-delegation chains for permission delegation

### Zero-Knowledge Proofs

- Replace signatures with ZK proofs for privacy
- Hide guild membership while proving eligibility

## References

- [EIP-712: Typed structured data hashing and signing](https://eips.ethereum.org/EIPS/eip-712)
- [Viem: TypeScript interface for Ethereum](https://viem.sh/)
- [React Query: Data fetching for React](https://tanstack.com/query/latest/)
