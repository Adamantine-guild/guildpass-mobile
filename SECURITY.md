# Security Policy

## Supported Versions

| Version      | Supported |
| ------------ | --------- |
| 1.0.x (main) | ✅ Yes    |

## Reporting a Vulnerability

If you discover a security vulnerability, **do not** open a public GitHub issue.

### How to report

1. **Email** **cerealboxx123@gmail.com** with subject `[SECURITY] guildpass-mobile — <brief description>`.
2. Include a description, steps to reproduce, and potential impact.
3. We will acknowledge receipt within **72 hours** and provide an assessment within **7 days**.

### Scope

This repository is a React Native / Expo mobile application.

**In-scope concerns:**

- Exposure of wallet private keys or mnemonics in logs, AsyncStorage, or app state
- Authentication or access-gate bypass via deep links or URL schemes
- Insecure storage of sensitive user data on device
- Man-in-the-middle vulnerabilities in API calls to guildpass-core
- **Forged or revoked access QR codes** — QR payloads are signed by the guild issuer using
  secp256k1 + keccak256 ECDSA and carrying a Key ID (`kid`). Payloads are verified client-side
  against the guild's published key registry, supporting concurrent key versions (rotation overlap)
  and rejecting revoked key IDs. See `docs/qr-key-rotation-protocol.md` and `docs/qr-signature-verification.md`.
- XSS-equivalent attacks via WebView components (if used)
- Root/jailbreak detection bypass
- Certificate pinning bypass
- Device integrity violations

**Out-of-scope:**

- Vulnerabilities in guildpass-core backend — report to that repo
- Expo SDK / React Native platform vulnerabilities — report to their maintainers
- Physical device security (e.g., screen lock bypass)

## Local Cache Encryption

The TanStack Query offline cache — which stores membership, role, guild, and
access-check data so the app works offline — is encrypted at rest with
AES-GCM-256. A device-bound symmetric key is held in the platform secure
enclave (iOS Keychain / Android Keystore via `expo-secure-store`) and is only
ever present in memory while the app is foregrounded. Cached data on disk is
therefore not human-readable without the device-bound key, even if an attacker
obtains raw filesystem access to a compromised or rooted device.

### Algorithm

- **Cipher**: AES-GCM-256 (authenticated encryption with associated data)
- **Key size**: 256 bits (32 bytes)
- **Nonce**: 12 bytes (96 bits), freshly randomized per encryption via
  `crypto.getRandomValues`
- **Authentication tag**: 16 bytes (128 bits)
- **Implementation**: Web Crypto `crypto.subtle.encrypt` / `decrypt`, with no
  third-party crypto dependencies

### Key derivation and storage

- The 256-bit key is generated with a cryptographically secure RNG and stored
  as a 64-character hex string under the key id `guildpass_encryption_key_v1`
  in `expo-secure-store`.
- Storage access flag is `WHEN_UNLOCKED_THIS_DEVICE_ONLY`, preventing key
  migration across devices or backups.
- The key is rotated every 30 days (`guildpass_key_timestamp_v1` tracks the
  creation timestamp) and a fresh key is generated on a clean reinstall.
- Key retrieval is bounded by a 100ms timeout; if retrieval fails (or the
  platform secure store is unavailable, e.g. on web), the cache degrades to
  in-memory-only operation and writes nothing sensitive to disk.
- Storage failures are retried up to three times with exponential backoff
  (100ms, 400ms, 900ms) before failing.

### On-disk format

Encrypted cache entries are stored as a versioned JSON envelope:

```json
{ "v": "gp1:", "n": "<base64 nonce>", "t": "<base64 auth tag>", "c": "<base64 ciphertext>" }
```

The `"gp1:"` magic prefix lets the persister distinguish encrypted entries
from legacy plaintext caches written by previous app versions. On first
encounter of a legacy entry, the persister:

1. Returns the cached data to TanStack unchanged (so users keep their offline
   data across the upgrade), and
2. Transparently re-encrypts and overwrites the entry in place.

If re-encryption fails for any reason — including key unavailability — the
legacy entry is **cleared** rather than left as plaintext on disk.

### Threat model

| Threat                                                                             | Mitigation                                                                                                                                                                                                 |
| ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Attacker gains filesystem access to a lost/stolen/rooted device                    | Data on disk is ciphertext; the key resides in the secure enclave and is not exportable.                                                                                                                   |
| Attacker analyses app memory for keys                                              | The key is only loaded from `expo-secure-store` while the app is actively rendering; it is never written to AsyncStorage, logs, or crash reports.                                                          |
| Attacker tampers with cached data to forge membership/role state                   | AES-GCM authentication tag is verified on every read; tampered ciphertext is rejected and the entry cleared. No forged payload ever reaches TanStack Query.                                                |
| Downgrade attack — attacker swaps an encrypted entry with a pre-#22 plaintext blob | The migration path is one-way: legacy plaintext is migrated on first read and the next write is always encrypted. Persistent failure to re-encrypt clears the entry rather than leaving plaintext on disk. |

### Performance impact

Encrypting and decrypting the offline cache is bounded by the
`EncryptionService` performance monitor:

- Target: <50 ms for payloads up to 10 KB (the upper bound of a typical
  per-query cache entry).
- Hard timeout: a single operation exceeding 100 ms fails gracefully with a
  `PERFORMANCE_TIMEOUT` error; the persister falls back to in-memory-only
  mode so the UI is never blocked.
- Cumulative metrics are exposed via `EncryptionService.getPerformanceMetrics()`
  for diagnostics.

### Relevant source

- `src/lib/encryptionService.ts` — AES-GCM-256 operations and performance tracking
- `src/lib/keyManager.ts` — key generation, storage, rotation, and timeout
- `src/lib/encryptedPersister.ts` — TanStack Query persister wrapper and migration
- `src/lib/queryPersister.ts` — wired into the app's `PersistQueryClientProvider`

## Embedded wallet custody review

Social/email onboarding uses Privy's embedded Ethereum wallet SDK. Privy is
the wallet custody/MPC provider: GuildPass never receives, stores, exports, or
logs a private key, recovery share, OTP, or OAuth credential. GuildPass stores
only the public EVM address in `wallet-storage`, exactly as it does for an
externally connected wallet.

- The `EXPO_PUBLIC_PRIVY_APP_ID` and `EXPO_PUBLIC_PRIVY_CLIENT_ID` values are
  publishable identifiers, not server secrets. Privy API secrets must stay in
  server-side secret management and must never be added to Expo `extra` values.
- Enable only the required login methods and configured redirect origins in the
  Privy dashboard. Require verified email/OAuth through the provider before a
  wallet address reaches GuildPass state.
- Embedded-wallet transaction/signature requests remain user-authorized via the
  provider. This release does not add automatic signing, server signers, or
  recovery/export functionality.
- Treat a compromised device or authenticated provider session as able to act
  through the embedded wallet. Keep device integrity checks, OS lock, and
  provider MFA/recovery policy enabled; test logout, account recovery, and
  session revocation before production rollout.
- Wallet ownership is not membership authorization. Every guild and access
  request still uses the existing server-side membership/access checks for the
  normalized address.

## Wallet and Session Storage

Wallet-linked state and authentication state are never persisted in plaintext AsyncStorage.
The `wallet-storage`, `session-storage`, `sync-storage`, and
`guildpass:reconciliation:v1` Zustand slices use
`expo-secure-store`, backed by the iOS Keychain and Android Keystore, with the
iOS accessibility level set to `WHEN_UNLOCKED_THIS_DEVICE_ONLY`. This includes:

- the connected wallet address and connection status;
- the connector kind (manual entry, WalletConnect, or another provider); and
- session tokens, expiry timestamps, and their associated wallet address;
- wallet-scoped sync metadata and reconciliation sequence numbers; and
- cached wallet role attestations, issuer verification keys, and their indexes.

### Upgrade migration

Before the first application render after upgrading, a migration gate enumerates
all known sensitive AsyncStorage keys, including dynamic attestation and issuer
cache entries. Each legacy value is copied to SecureStore and its AsyncStorage
entry is deleted and verified absent. Cleanup is retried three times. If the
secure write, enumeration, or verified cleanup fails, migration fails closed:
plaintext data is never returned for hydration and the application remains
behind a recovery screen until the user retries and receives a clean migration
report. Normal writes and sign-out/reset operations also remove any stale legacy
copy, making the migration one-way.

Storage names containing characters unsupported by SecureStore are mapped to
opaque SHA-256 identifiers before reaching the native API. This prevents dynamic
names from exposing wallet addresses through Android's SecureStore preferences.
Values written by pre-release builds with the former reversible hexadecimal key
format are migrated to the opaque format on access and the former entry is
deleted. Values larger than SecureStore's 2048-byte per-entry limit are split
into bounded chunks with a versioned manifest; no chunk exceeds 1800 bytes.

The persistence tests in `tests/storage.test.ts` audit every address-bearing
persistence path. They seed every historical key family, execute the same
first-launch migration used by the app, verify AsyncStorage is empty afterward,
enforce SecureStore's real key and value constraints, exercise cleanup failure
and recovery-gate behavior, and reject wallet identifiers in AsyncStorage values
or reversible SecureStore entry names.

### Relevant source

- `src/lib/storage/index.ts` — SecureStore adapter and one-way migration
- `src/features/wallet/wallet.store.ts` — wallet persistence configuration
- `src/features/session/session.store.ts` — session persistence configuration
- `src/features/sync/sync.store.ts` — wallet-scoped sync persistence
- `src/features/notifications/reconciliation.store.ts` — per-wallet reconciliation state
- `src/features/attestation/attestationStorage.ts` — per-wallet attestation cache
- `src/features/attestation/issuerKeyRegistry.ts` — issuer verification-key cache
- `src/features/security/SensitiveStorageMigrationGate.tsx` — fail-closed startup gate
- `tests/storage.test.ts` — migration and plaintext-write audit coverage
- `tests/sensitiveStorageMigrationGate.test.tsx` — failure and verified-retry coverage

### Disclosure Policy

- We ask for a **90-day** coordinated disclosure window.
- We will credit reporters in release notes unless you prefer anonymity.

---

## Security Hardening

GuildPass Mobile implements a defense-in-depth security hardening layer:

| Control                 | Description                                                                      | Document                                                |
| ----------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------- |
| **Device Integrity**    | Best-effort root/jailbreak detection with configurable response (warn vs. block) | [Source](./src/features/security/deviceIntegrity.ts)    |
| **Certificate Pinning** | TLS public-key pinning for all traffic to GuildPass API domains                  | [Source](./src/features/security/certificatePinning.ts) |
| **Secure Fetch**        | Fetch wrapper enforcing domain validation and device integrity gates             | [Source](./src/lib/secureFetch.ts)                      |
| **QR Key Rotation**     | Versioned secp256k1 key verification with revocation list checks & bounded TTL   | [Source](./src/features/access/guildIssuerKey.ts)       |

### Supporting Documentation

- **[Threat Model](./docs/threat-model.md)** — scopes what the hardening does and does not protect against
- **[QR Key Rotation Protocol](./docs/qr-key-rotation-protocol.md)** — protocol specification and threat model for key rotation & revocation
- **[Pin Rotation Runbook](./docs/pin-rotation-runbook.md)** — procedure for rotating TLS certificate pins without bricking connectivity

### Security Architecture

```
┌─────────────────────────────────────────────────────┐
│                  GuildPass Mobile                    │
│                                                     │
│  ┌──────────────────────┐  ┌──────────────────────┐ │
│  │  Device Integrity     │  │  Certificate Pinning │ │
│  │  (Root/JB Detection)  │  │  (TLS SPKI Hashes)   │ │
│  │  - JS heuristics      │  │  - Android NSC       │ │
│  │  - Native checks      │  │  - iOS ATS           │ │
│  │  - Configurable policy│  │  - JS domain guard   │ │
│  └──────────────────────┘  └──────────────────────┘ │
│                                                     │
│  ┌─────────────────────────────────────────────────┐│
│  │  secureFetch() wrapper                           ││
│  │  - Enforces domain validation                    ││
│  │  - Optional device integrity gate                ││
│  └─────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────┘
```

Thank you for helping keep GuildPass secure.
