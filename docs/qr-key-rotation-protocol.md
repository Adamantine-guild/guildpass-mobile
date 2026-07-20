# QR Payload Rotating-Key Signing & Revocation Protocol

This document defines the formal protocol specification and security threat model for versioned, rotatable signing keys and key revocation handling in GuildPass access QR payloads.

---

## 1. Overview

GuildPass access QR payloads are signed by guild access backends using secp256k1 keypairs. To prevent key compromise from permanently invalidating all issued credentials or forcing emergency client updates, GuildPass employs a **rotating-key protocol with key IDs (`kid`)** and **active revocation tracking**.

The client application fetches and caches a guild's published key registry via the GuildPass SDK (`@guildpass/sdk`), verifies signatures against the key specified by the payload's `kid`, and enforces strict revocation checks.

---

## 2. Payload Schema

QR payloads carry a versioned payload schema including a key identifier (`kid`):

```json
{
  "type": "guildpass.access-check",
  "version": 1,
  "guildId": "guild_abc",
  "resourceId": "vip-door",
  "walletAddress": "0x1234567890123456789012345678901234567890",
  "expiresAt": "2026-07-20T12:05:00.000Z",
  "kid": "key-2026-v2",
  "signature": "304402204f4c2f...",
  "nonce": "nonce-abc-123"
}
```

### Schema Fields

| Field | Type | Description |
| --- | --- | --- |
| `type` | string | Constant identifier (`guildpass.access-check`). |
| `version` | number | Canonical schema version (`1`). |
| `guildId` | string | Unique guild ID. |
| `resourceId` | string | Target resource or access gate ID. |
| `walletAddress` | string (optional) | Holder wallet address (0x-prefixed hex). |
| `expiresAt` | string (optional) | ISO-8601 UTC timestamp after which payload expires. |
| `kid` | string (optional) | Key ID identifying which issuer public key signed the payload. |
| `signature` | string (optional) | DER-encoded hex secp256k1 ECDSA signature over canonical message. |
| `nonce` | string (optional) | Unique per-issuance identifier for replay protection. |

---

## 3. Signing Scheme & Canonical Message

The signature is generated over a deterministic, newline-delimited canonicalization of the payload fields:

```
type\nversion\nguildId\nresourceId\nwalletAddress\nexpiresAt\nkid
```

- Field values are **not trimmed** during message construction to ensure byte-for-byte agreement.
- Absent optional fields (`walletAddress`, `expiresAt`, `kid`) evaluate to empty strings (`""`).
- `type` and `version` are pinned to canonical constants (`guildpass.access-check`, `1`) by the verifier.
- Digest algorithm: `keccak256(canonicalMessage)`.
- Signature algorithm: secp256k1 ECDSA DER-encoded hex string.

---

## 4. Key Registry Schema & Fetching

The client fetches the guild's key registry via `guildPassClient.guilds.getGuildConfig({ guildId })`.

### Key Registry Structure

```typescript
type GuildKeyRegistry = {
  guildId: string;
  keys: Map<string, string>;       // Map of kid -> hex secp256k1 public key
  revokedKids: Set<string>;        // Set of revoked key IDs
  fetchedAt: number;              // Timestamp (ms) when fetched
  legacyPublicKey?: string;        // Fallback static public key for legacy payloads
};
```

The SDK config response provides keys and revocation lists in either object map or array entry format:

```json
{
  "guildId": "guild_abc",
  "issuerKeys": {
    "key-2026-v1": "043531a2...",
    "key-2026-v2": "045f0611..."
  },
  "revokedKids": ["key-2025-v0"]
}
```

---

## 5. Cache Strategy & Safe Offline Fallback

To balance scanner performance, network efficiency, and security, key registries are cached with a **bounded Time-To-Live (TTL)** and a **hard offline trust window**.

### Timing Constants

- **Bounded Cache TTL**: `15 minutes` (`15 * 60 * 1000 ms`).
- **Offline Trust Window**: `24 hours` (`24 * 60 * 60 * 1000 ms`).

### Resolution & Refresh Workflow

```
                        ┌─────────────────────────┐
                        │   Scanner reads payload │
                        └────────────┬────────────┘
                                     │
                        ┌────────────▼────────────┐
                        │ Check local key cache   │
                        └────────────┬────────────┘
                                     │
                     ┌───────────────┴───────────────┐
                     │ Cache hit & Age < TTL (15m)?  │
                     └───────┬───────────────┬───────┘
                            YES              NO
                             │               │
                             │   ┌───────────▼───────────┐
                             │   │ Fetch online via SDK  │
                             │   └───────────┬───────────┘
                             │               │
                             │       ┌───────┴───────┐
                             │    SUCCESS         FAILURE (Offline)
                             │       │               │
                             │  ┌────▼────┐   ┌──────▼──────────────────────┐
                             │  │ Update  │   │ Age <= Trust Window (24h)?  │
                             │  │ cache   │   └──────┬──────────────┬───────┘
                             │  └────┬────┘         YES             NO
                             │       │               │              │
                             │       │        ┌──────▼─────┐ ┌──────▼──────┐
                             │       │        │ Use cached │ │ Reject QR   │
                             │       │        │ fallback   │ │ (EXPIRED)   │
                             │       │        └──────┬─────┘ └─────────────┘
                             │       │               │
                             ▼       ▼               ▼
                        ┌─────────────────────────┐
                        │ Validate kid & Signature│
                        └─────────────────────────┘
```

1. **Cache Fresh (`Age < TTL`)**: Use cached key registry directly.
2. **Cache Expired (`Age >= TTL`), Online**: Fetch updated registry from SDK. On success, update cache timestamp.
3. **Cache Expired (`Age >= TTL`), Offline**:
   - If `Age <= Offline Trust Window (24h)`: Fall back safely to cached key registry.
   - If `Age > Offline Trust Window (24h)`: Reject verification with `QR_KEY_REGISTRY_EXPIRED`.
4. **No Cache, Offline**: Reject verification with `QR_SIGNATURE_PUBLIC_KEY_UNAVAILABLE`. **Never silently accept unverifiable payloads.**

---

## 6. Payload Verification Logic

When `appConfig.qrSignatureVerification` is enabled:

1. **Key ID Resolution**:
   - Extract `kid` from parsed payload.
   - Look up `kid` in guild's `GuildKeyRegistry`.
2. **Revocation Check**:
   - If `kid` exists in `registry.revokedKids`: **REJECT** immediately with code `QR_KEY_REVOKED`.
   - *A payload signed with a revoked `kid` is rejected regardless of signature validity.*
3. **Unknown Key Check**:
   - If `kid` is specified but absent from `registry.keys`: **REJECT** with code `QR_KEY_UNKNOWN`.
4. **Rotation Overlap**:
   - Multiple key versions (`key-v1`, `key-v2`) may be concurrently valid in `registry.keys`. The verifier resolves the exact key matching `kid`.
5. **Cryptographic Verification**:
   - Verify `signature` against resolved public key over `buildSigningMessage(payload)`.
   - If signature check fails: **REJECT** with code `QR_SIGNATURE_VERIFICATION_FAILED`.

---

## 7. Threat Model & Security Analysis

### 7.1. Key Compromise Scenario

- **Threat**: An attacker extracts an issuer private key (e.g., from a compromised server or repository secret leakage).
- **Mitigation**:
  1. The guild administrator immediately generates a new keypair (`key-v3`) and marks `key-v2` as `revoked` in the backend key registry.
  2. Upon client cache refresh, any QR payload signed with `key-v2` is rejected with `QR_KEY_REVOKED` even if the signature is mathematically valid.
  3. New payloads are signed exclusively with `key-v3`.

### 7.2. Revocation Propagation Delay

- **Threat**: During the cache TTL window (up to 15 minutes), a scanner using cached registry data may accept QR codes signed by a recently revoked key before the client attempts a refresh.
- **Mitigation**:
  - 15-minute TTL bounds the vulnerability window.
  - Critical access points can force cache invalidation via app restart or manual cache clear (`clearIssuerKeyCache()`).
  - Server-side access verification acts as an additional defense-in-depth layer.

### 7.3. Replay & Rollback of Revocation State

- **Threat**: An attacker performs a Man-In-The-Middle (MITM) attack or network blocking to force the client into offline fallback mode, causing it to use a cached registry that does not yet include the revocation of `key-v2`.
- **Mitigation**:
  - All SDK network traffic is secured via TLS with mandatory certificate pinning (`docs/threat-model.md`). MITM tampering with registry responses is prevented at the transport layer.
  - Hard upper bound on offline trust window (24 hours). After 24 hours without backend contact, the scanner refuses all signatures until online connectivity is restored.

### 7.4. Offline-Fallback Trust Assumptions

- **Threat**: Legitimate offline scanning (e.g., turnstiles or gates with intermittent connectivity) must function without exposing the system to indefinite key forgery.
- **Trust Assumptions**:
  - Device clock accuracy is maintained by the operating system.
  - Cached key registries stored in encrypted local storage (`SECURITY.md`) cannot be tampered with locally.
  - Offline operation trade-off: Access point availability during transient outages is prioritized for up to 24 hours, after which safety overrides availability.

---

## 8. Source Code Map

| Component | Path | Responsibility |
| --- | --- | --- |
| Signature Primitives | `src/features/access/qrSignature.ts` | ECDSA secp256k1 verification & canonical message builder |
| Key Registry & Cache | `src/features/access/guildIssuerKey.ts` | Key fetch, rotation, revocation check, TTL & offline fallback |
| Verification Pipeline | `src/features/access/verifyQrPayload.ts` | End-to-end QR parsing, key resolution, and signature check |
| Schema Definition | `src/features/access/qrPayload.ts` | Structural payload parsing & `kid` validation |
| Test Suite | `tests/qrKeyRotation.test.ts` | Comprehensive unit/integration coverage for key rotation |
