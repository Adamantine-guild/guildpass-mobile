# QR Payload Signature Verification

GuildPass access QR codes carry a cryptographic signature so the mobile app can
prove a scanned payload was actually issued by the guild's access backend — not
fabricated client-side.

This document covers the signing scheme, the client verification path, the
feature flag used for gradual rollout, and how to operate it.

---

## Why

Previously, an access QR was plain JSON validated only by schema + expiry
checks (and a server-side lookup). A well-formed, non-expired payload with a
real `guildId` / `resourceId` could in principle be forged on-device, because
nothing proved *who* issued it. Signature verification closes that gap: the app
now checks the payload against the guild's published **issuer public key**
before treating it as trustworthy.

---

## Signing scheme

The issuer (guild access backend) signs every QR payload with its secp256k1
issuer keypair.

**Signed message** — a deterministic, newline-delimited canonicalization of the
payload fields (the `signature` field itself is *not* included):

```
type\nversion\nguildId\nresourceId\nwalletAddress\nexpiresAt
```

- `walletAddress` and `expiresAt` are serialized as the empty string when
  absent.
- Strings are **not** trimmed before signing, so the signer and verifier agree
  byte-for-byte on the exact signed bytes.
- `type` and `version` are pinned to the canonical constants
  (`guildpass.access-check`, `1`) by the verifier and are **not** read from the
  payload, so a fabricated payload cannot vary them to dodge verification.

**Hash** — `keccak256(message)`. This matches the Web3 convention used across
the GuildPass stack (ethers / viem / js-sha3).

**Curve / signature** — secp256k1 (the same curve as Ethereum). The signature
is ECDSA over the keccak256 digest, DER-encoded and hex-serialized into the
payload's `signature` field (lower-case hex, optional `0x` prefix).

```
{
  "type": "guildpass.access-check",
  "version": 1,
  "guildId": "guild_abc",
  "resourceId": "vip-door",
  "walletAddress": "0x…",
  "expiresAt": "2026-06-23T12:05:00.000Z",
  "signature": "30440220…"
}
```

> Changing `buildSigningMessage` (field order, set, or trimming) is a
> **breaking change for every issued QR**. Coordinate any change with the
> issuer backend and bump `ACCESS_QR_VERSION`.

---

## Client verification path

| Module | Responsibility |
| --- | --- |
| `src/features/access/qrConstants.ts` | Canonical `ACCESS_QR_TYPE` / `ACCESS_QR_VERSION`. |
| `src/features/access/qrSignature.ts` | Pure `verifyQrSignature()` + `buildSigningMessage()` using `elliptic` (secp256k1) and `js-sha3` (keccak256). Throws `QrSignatureError` with a specific code. |
| `src/features/access/guildIssuerKey.ts` | Fetches and in-memory-caches the guild issuer public key via `guildPassClient.guilds.getGuildConfig({ guildId })` → `issuerPublicKey`. |
| `src/features/access/verifyQrPayload.ts` | `verifyAndParseAccessQrPayload()` — structural parse + (flag-gated) signature verification. |
| `src/features/access/qrPayload.ts` | `parseAccessQrPayload()` — pure structural / expiry validation. SDK-free, trivially testable. |

`verifyQrSignature` rejects with one of these specific error codes (see
`QR_SIGNATURE_ERROR_CODES`):

- `QR_SIGNATURE_MISSING` — payload has no signature.
- `QR_SIGNATURE_FORMAT_INVALID` — signature is not valid hex.
- `QR_SIGNATURE_PUBLIC_KEY_UNAVAILABLE` — guild config has no usable key / fetch failed.
- `QR_SIGNATURE_VERIFICATION_FAILED` — signature does not match the payload.

The scanner (`app/access-scanner.tsx`) calls `verifyAndParseAccessQrPayload`
on scan. A `QrSignatureError` surfaces as *"QR code signature is invalid or
missing."* to the user.

---

## Feature flag & gradual rollout

The verification is gated by the **`qrSignatureVerification`** feature flag so
existing unsigned QR codes keep working during the migration window.

- **Flag OFF (default)** — `verifyAndParseAccessQrPayload` performs only
  structural + expiry checks. Unsigned payloads scan normally.
- **Flag ON** — payloads *must* carry a valid signature; missing / malformed /
  failed signatures are rejected with a `QrSignatureError`.

The flag is opt-in via environment, so rollout is staged per environment with
no app-store resubmission:

| Source (precedence) | Example |
| --- | --- |
| `app.json` → `extra.qrSignatureVerification` | `"qrSignatureVerification": true` |
| `EXPO_PUBLIC_QR_SIGNATURE_VERIFICATION` | `EXPO_PUBLIC_QR_SIGNATURE_VERIFICATION=true` |

Accepted values: `true` / `false` / `1` / `0` / `yes` / `no` (anything truthy
enables it). It defaults to **OFF**.

**Recommended rollout:** development → preview → production, after the issuer
backend signs **all** guild QR codes. Flip it on in `app.json` / env per build.

---

## Issuer key management

- The guild's issuer public key is published in the guild config returned by
  the SDK (`guilds.getGuildConfig`) as `issuerPublicKey` (hex-encoded
  secp256k1 public key; compressed or uncompressed).
- Keys are cached in-memory per `guildId` for the process lifetime (one fetch
  per scanned guild per session). See `clearIssuerKeyCache()` for tests.
- The **private** key never leaves the issuer backend. If a key is compromised,
  rotate it in the guild config; old QR codes signed by the retired key will
  fail verification (by design).

---

## Testing

- `tests/qrSignature.test.ts` — pure unit tests for `buildSigningMessage` and
  `verifyQrSignature` (valid pass, tampered rejected, missing / malformed /
  bad-key rejected, `0x`-prefix tolerance). Uses a fixed test keypair in
  `tests/fixtures/guild.fixtures.ts`.
- `tests/verifyAndParseQrPayload.test.ts` — integration: flag OFF accepts
  unsigned, flag ON accepts signed / rejects unsigned / rejects tampered; public
  key fetch + cache behavior. Mocks `guildpassClient` directly.

Run: `npm test` (vitest).

---

## Security notes

- Verification runs **client-side** and is a defense-in-depth layer on top of
  the existing server-side access check — it is not a substitute for it.
- A forged QR can no longer be accepted unless the attacker holds the guild
  issuer private key.
- `keccak256` + secp256k1 ECDSA is the standard Web3 signing primitive; the
  verification path is pure-JS (`elliptic` + `js-sha3`) so it runs identically
  in Node (tests) and React Native (app).
