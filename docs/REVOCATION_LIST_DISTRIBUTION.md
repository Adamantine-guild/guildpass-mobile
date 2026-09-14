# Offline Revocation List Distribution for EIP-712 Attestations

## Problem

Attestations are designed to be verifiable entirely offline once cached, but there's no mechanism to distribute revocation state in a way that's usable offline with freshness guarantees.

**Core Issue**: If a guild issuer key is compromised and revoked, offline verifiers have no way to know because:
- Revocation data is only available online
- No cached revocation list with bounded trust window
- Portable attestations lack revocation context

## Solution Overview

A versioned, monotonically-increasing revocation list per guild issuer, cached locally with a bounded trust window, with explicit policy for stale/unavailable data and bundling for third-party verification.

## Design

### 1. Revocation List Format

```typescript
interface RevocationList {
  guildId: string;
  version: number;           // Monotonically increasing
  issuedAt: number;          // Unix timestamp (ms)
  expiresAt: number;         // Unix timestamp (ms)
  revokedKeys: RevokedKey[];
  signature: string;         // EIP-191 signature
}

interface RevokedKey {
  keyId?: string;            // For multi-key guilds
  address: string;           // Issuer address (0x-prefixed)
  revokedAt: number;         // When revoked (Unix ms)
  reason?: string;           // 'compromised' | 'rotation' | 'admin' | 'other'
}
```

### 2. Trust Model

- **Revocation lists are signed** by the guild's authority key
- **Version monotonicity**: prevents rollback attacks
- **Bounded trust window**: 24 hours default for offline use
- **Fail-closed**: when data unavailable, reject the attestation

### 3. Local Caching Strategy

```typescript
// Cache tiers
- Memory: 15 min TTL (fast lookups)
- Persistent: 24 hour offline trust window
- Expiry: lists are deleted after 7 days

// Freshness policy
- Fresh: age <= 15 min → use from memory
- Stale Trusted: 15 min < age <= 24 hours → use from persistent storage
- Expired: age > 24 hours → reject (fail closed)
```

### 4. Distribution Mechanisms

#### Push Distribution (Primary)
- Backend pushes revocation lists during sync
- Cached locally in secure storage
- Automatic refresh on app startup

#### Bundled Distribution (Portability)
- Attestations can include recent revocation list snapshot
- Third-party verifiers get attestation + revocation state
- Presenter responsible for keeping revocation data current

### 5. Implementation Plan

**Phase 1: Core Types & Storage**
- `revocationList.types.ts` - type definitions
- `revocationListStorage.ts` - secure storage layer
- `revocationListVerifier.ts` - signature verification

**Phase 2: Cache Management**
- `revocationListCache.ts` - in-memory + persistent cache
- Integration with existing `attestationService.ts`

**Phase 3: Sync & Distribution**
- `revocationListSync.ts` - automatic sync service
- `portableAttestation.ts` - bundling for third-party verification

## Security Considerations

### Replay Protection
- Version numbers must be monotonically increasing
- Reject lists with version ≤ cached version
- Content hashes for integrity checking

### Signature Verification
- All revocation lists cryptographically signed
- Authority key verification chain
- Invalid signatures rejected immediately

### Fail-Closed Policy
```typescript
// When revocation status indeterminate:
if (revocationDataUnavailable) {
  return { 
    valid: false, 
    reason: 'Revocation data unavailable',
    failClosed: true 
  };
}
```

## Files Created

```
src/features/attestation/
├── revocationList.types.ts       # Core types & interfaces
├── revocationListStorage.ts      # Secure storage operations
├── revocationListVerifier.ts     # Signature & validation
├── revocationListCache.ts        # Cache management
├── revocationListSync.ts         # Sync service integration
└── portableAttestation.ts        # Bundled distribution

docs/
└── REVOCATION_LIST_DISTRIBUTION.md  # Design document
```

## Acceptance Criteria

- [x] Revocation list format defined and implemented
- [x] Local caching with bounded trust window (24h default)
- [x] Fail-closed policy when revocation status indeterminate
- [x] Signature verification for all revocation lists
- [x] Backward compatibility with existing attestations
- [ ] Comprehensive test coverage
- [ ] Documentation updated
- [ ] Integration with sync service

## Backward Compatibility

- No changes to existing `RoleAttestation` structure
- Revocation checking is additive verification step
- Graceful degradation when revocation data unavailable

## Error Handling

```typescript
// Error categories
- INVALID_SIGNATURE
- EXPIRED_LIST  
- VERSION_ROLLBACK
- CORRUPTED_DATA
- CACHE_EXPIRED
- TRUST_WINDOW_EXCEEDED
- NETWORK_UNAVAILABLE
```

## Next Steps

1. **SDK Integration**: Backend APIs for revocation list distribution
2. **Testing**: Unit + integration tests for offline scenarios
3. **Performance**: Profile storage operations for large lists
4. **Documentation**: Update attestation protocol docs
