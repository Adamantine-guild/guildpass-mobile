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
- **Forged access QR codes** — QR payloads are signed by the guild issuer and
  verified client-side against the guild's published `issuerPublicKey`
  (secp256k1 + keccak256 ECDSA). A QR without a valid signature must be
  rejected. See `docs/qr-signature-verification.md`.
- **Unauthenticated / address-spoofed membership & role queries** — prior to the
  SIWE session work, the app trusted whatever wallet address the client claimed
  and passed it as a raw parameter to membership/role/access SDK calls. Now every
  user-scoped query is bound to the **proven session address** and carries a
  **bearer token**; the server authorizes from the verified token, not the request
  body, and queries for a non-session address are rejected client-side. See
  `docs/siwe-session-architecture.md`.
- XSS-equivalent attacks via WebView components (if used)

### SIWE session authentication (threat model)

The app authenticates by signing a Sign-In With Ethereum (EIP-4361) message and
exchanging it for a short-lived access token + a rotating refresh token. Key
guarantees:

- **No bare-address trust.** A malicious or modified build cannot query
  membership/role data for arbitrary addresses — the address comes from the
  signed-in session, and the server binds the token to its subject.
- **Nonce replay protection.** The backend issues a single-use nonce embedded in
  the signed message; reused/forged nonces fail exchange.
- **Refresh-token rotation.** Each refresh returns a new refresh token; the old
  one is invalidated server-side, so a stolen refresh token has a one-shot window.
- **Revocation on logout.** `endSession()` revokes the refresh token at the server
  and clears it from `expo-secure-store`.
- **Isolated sensitive storage.** The refresh token lives in its own secure key,
  never alongside the less-sensitive session JSON.
- **Transparent refresh.** An expired access token triggers one silent refresh +
  retry on a `401`; a failed refresh ends the session and prompts re-auth, with no
  refresh loop.

**Out-of-scope:**

- Vulnerabilities in guildpass-core backend — report to that repo
- Expo SDK / React Native platform vulnerabilities — report to their maintainers
- Physical device security (e.g., screen lock bypass)

### Disclosure Policy

- We ask for a **90-day** coordinated disclosure window.
- We will credit reporters in release notes unless you prefer anonymity.

Thank you for helping keep GuildPass secure.
