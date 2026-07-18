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
- XSS-equivalent attacks via WebView components (if used)
- Root/jailbreak detection bypass
- Certificate pinning bypass
- Device integrity violations

**Out-of-scope:**

- Vulnerabilities in guildpass-core backend — report to that repo
- Expo SDK / React Native platform vulnerabilities — report to their maintainers
- Physical device security (e.g., screen lock bypass)

### Disclosure Policy

- We ask for a **90-day** coordinated disclosure window.
- We will credit reporters in release notes unless you prefer anonymity.

---

## Security Hardening

GuildPass Mobile implements a defense-in-depth security hardening layer:

| Control | Description | Document |
|---------|-------------|----------|
| **Device Integrity** | Best-effort root/jailbreak detection with configurable response (warn vs. block) | [Source](./src/features/security/deviceIntegrity.ts) |
| **Certificate Pinning** | TLS public-key pinning for all traffic to GuildPass API domains | [Source](./src/features/security/certificatePinning.ts) |
| **Secure Fetch** | Fetch wrapper enforcing domain validation and device integrity gates | [Source](./src/lib/secureFetch.ts) |

### Supporting Documentation

- **[Threat Model](./docs/threat-model.md)** — scopes what the hardening does and does not protect against
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
