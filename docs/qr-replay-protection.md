# QR Access-Check Replay Protection

GuildPass access QR codes are validated on-device before being submitted for
an access check. This document covers client-side **replay protection**: how
the app stops a single-use payload from being submitted more than once.

---

## Why

Access QR payloads carry an `expiresAt` timestamp, but expiry alone doesn't
stop reuse: a payload photographed or screen-recorded before it expires could
be resubmitted by an unauthorized party for repeated verification attempts
during that window. Nothing in the schema previously distinguished "a payload
I haven't seen" from "a payload I already accepted five seconds ago."

This is **defense-in-depth**, not a replacement for server-side enforcement.
It runs entirely client-side, on a single device/app session, so it cannot
detect replay across devices or app reinstalls. True single-use enforcement
requires the issuer backend to track redemptions; that is being coordinated
separately with the `@guildpass/sdk` maintainers.

---

## How it works

- The payload schema gains an optional `nonce` field: a unique identifier
  minted per issuance by the issuer backend.
- `src/features/access/qrReplayGuard.ts` keeps an in-memory
  `Map<nonce, expiresAtMs>` of nonces the app has already accepted.
- `verifyAndParseAccessQrPayload()` (in `verifyQrPayload.ts`) calls
  `checkAndRecordNonce()` after structural (and, when enabled, signature)
  validation succeeds. If the nonce is already in the map, it throws a
  `QrPayloadError` with code `QR_PAYLOAD_ALREADY_USED` instead of returning
  the parsed payload.
- The scanner (`app/access-scanner.tsx`) catches that error and shows
  **"This QR code has already been used."**

Payloads without a `nonce` skip the replay check entirely (migration window,
same pattern used for the optional `signature` field) — they're validated
structurally and, if the signature flag is on, cryptographically, exactly as
before.

### Cache shape

| Property     | Behavior                                                                                                                                                          |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Self-pruning | On every check, entries whose `expiresAt` has passed are dropped before the new nonce is checked/recorded — no timers needed.                                     |
| Bounded      | Capped at 500 entries; once full, the oldest-inserted entry is evicted to make room. Prevents unbounded growth from a scan burst or payloads without `expiresAt`. |
| Fallback TTL | A payload without a usable `expiresAt` is still tracked, but with a 5-minute fallback TTL so it doesn't linger forever.                                           |

---

## Error codes

| Code                       | Meaning                                                                             |
| -------------------------- | ----------------------------------------------------------------------------------- |
| `QR_PAYLOAD_INVALID_NONCE` | `nonce` is present but not a non-empty string (structural check in `qrPayload.ts`). |
| `QR_PAYLOAD_ALREADY_USED`  | `nonce` was already accepted within its validity window (`qrReplayGuard.ts`).       |

Both are `QrPayloadError` instances — check `.code` to distinguish them from
other payload rejection reasons.

---

## Testing

- `src/features/access/qrPayload.test.ts` — structural nonce validation.
- `tests/qrReplayGuard.test.ts` — cache behavior: first-use accepted, reuse
  rejected, self-pruning after expiry, per-nonce isolation, bounded eviction.
- `tests/verifyAndParseQrPayload.test.ts` — integration: first use accepted,
  replay rejected with `QR_PAYLOAD_ALREADY_USED`, distinct nonces don't
  collide.

Run: `npm test` (vitest).

---

## Future work

- Coordinate with `@guildpass/sdk` maintainers to mint `nonce` server-side for
  every issued payload and, eventually, enforce single-use redemption there
  too — the client-side guard alone cannot stop replay across devices.
- Once nonces are universal, consider including `nonce` in the signed message
  (`qrSignature.buildSigningMessage`) so a forged/stripped nonce is also
  cryptographically detectable. That's a wire-format change and needs a
  version bump plus issuer backend coordination (see
  `docs/qr-signature-verification.md`).
