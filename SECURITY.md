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
- XSS-equivalent attacks via WebView components (if used)

**Out-of-scope:**

- Vulnerabilities in guildpass-core backend — report to that repo
- Expo SDK / React Native platform vulnerabilities — report to their maintainers
- Physical device security (e.g., screen lock bypass)

### Disclosure Policy

- We ask for a **90-day** coordinated disclosure window.
- We will credit reporters in release notes unless you prefer anonymity.

Thank you for helping keep GuildPass secure.
