# Threat Model: GuildPass Mobile Security Hardening

> **Version:** 1.0  
> **Date:** 2026-07-18  
> **Status:** Living document — update when architecture or threat landscape changes.

## 1. Introduction

This document scopes the security hardening implemented in GuildPass Mobile v1.0.x. It describes **what the hardening protects against**, **what it does NOT protect against**, and the assumptions underlying each control.

The hardening layer consists of two controls:

| Control | Mechanism | Scope |
|---------|-----------|-------|
| **Device Integrity** (Root/Jailbreak Detection) | JS heuristic checks + native config plugin | Detect compromised device environments |
| **Certificate Pinning** | Native TLS pinning (Android NSC / iOS ATS) + JS domain validation | Prevent MITM attacks on API traffic |

---

## 2. System Model

```
┌──────────────────────────────┐     ┌───────────────────────┐
│  GuildPass Mobile Client     │     │  GuildPass API Server │
│                              │     │                       │
│  ┌──────────────────────┐    │     │  api.guildpass.xyz    │
│  │ Device Integrity     │    │     │                       │
│  │ (Root/JB Detection)  │    │     │  staging.guildpass.xyz│
│  └──────────────────────┘    │     │                       │
│                              │     └───────────────────────┘
│  ┌──────────────────────┐    │              ▲
│  │ Certificate Pinning  │────┼──────────────┘
│  │ (TLS + SPKI Hashes)  │    │    TLS 1.2+ with pinned
│  └──────────────────────┘    │    public keys
│                              │
│  ┌──────────────────────┐    │
│  │ Wallet / Key Storage │    │
│  │ (expo-secure-store)  │    │
│  └──────────────────────┘    │
└──────────────────────────────┘
```

### Assets Under Protection

| Asset | Sensitivity | Storage |
|-------|-------------|---------|
| Wallet address / identifier | Medium | AsyncStorage (public data) |
| Access-control decisions (QR payloads) | High | In-memory only |
| Signed attestations / proofs | High | Transient; not persisted |
| Future: embedded private keys | **Critical** | Planned: `expo-secure-store` / Secure Enclave |
| Session / auth tokens | High | `expo-secure-store` |

---

## 3. Threat Actors

| Actor | Capability | Motivation |
|-------|-----------|------------|
| **Casual attacker** | Installs public rooting tools, MITM proxy apps | Curiosity, casual fraud |
| **Sophisticated attacker** | Custom ROMs, kernel modules, hardware debuggers | Targeted theft of assets/access |
| **Network adversary** | Controls local network (Wi-Fi, VPN), ARP spoofing | Intercept API traffic, steal tokens |
| **Malicious insider** | Access to build pipeline, signing keys | Supply-chain compromise |
| **Nation-state actor** | Zerodium-grade exploits, physical device access | Out of scope for this document |

---

## 4. Control 1: Device Integrity (Root/Jailbreak Detection)

### 4.1 What It Protects Against

| Threat | Mitigation |
|--------|-----------|
| Modified app binary intercepting signed attestations | Detection raises barrier; requires bypass of native checks |
| Hooking frameworks (Frida, Xposed, Substrate) | Native module detects framework artifacts |
| Casual rooting via Magisk/SuperSU (Android) | File-path and property checks |
| Casual jailbreaking via checkra1n/unc0ver (iOS) | File-path and sandbox checks |

### 4.2 What It Does NOT Protect Against

| Threat | Rationale |
|--------|-----------|
| Kernel-level rootkits that hide files/properties | Detection relies on OS APIs the kernel can lie about |
| Hardware debuggers (JTAG/SWD) | Outside JS/native app boundary |
| Custom AOSP builds that mask root indicators | Attacker controls the OS; all checks are bypassable |
| Running in a compromised emulator with root hidden | Emulator detection is separate and also bypassable |
| Zero-day jailbreak/root exploits | By definition, detection signatures lag behind |

### 4.3 Implementation Details

- **JS layer** (`src/features/security/deviceIntegrity.ts`): Heuristic checks that run on app launch and foreground events.
- **Native layer** (config plugin): Platform-specific native code that checks filesystem paths, system properties, and sandbox integrity.
- **Response policy**: Configurable — `"warn"` (log only) or `"block"` (reject sensitive operations). Default: `"block"` for production.
- **Cache**: Results are cached for 60 seconds (configurable) to avoid excessive re-computation.

### 4.4 Assumptions

1. The native config plugin is included in production EAS builds.
2. The app is not running in Expo Go in production (native checks are unavailable in Expo Go).
3. Root/jailbreak detection is a **defense-in-depth** measure, not a security boundary.

---

## 5. Control 2: Certificate / Public-Key Pinning

### 5.1 What It Protects Against

| Threat | Mitigation |
|--------|-----------|
| MITM proxy (Charles, Burp, mitmproxy) with user-installed CA | App rejects non-pinned certificate |
| Compromised CA issuing fraudulent certs for `guildpass.xyz` | Only the pinned SPKI hashes are trusted |
| DNS poisoning + attacker-controlled server with valid cert | Pinning by SPKI, not by CA chain |
| Rogue Wi-Fi access point intercepting TLS | Pinning enforced at native TLS layer |

### 5.2 What It Does NOT Protect Against

| Threat | Rationale |
|--------|-----------|
| Compromise of the GuildPass API server private key | Pinning trusts that specific key; if stolen, attacker can impersonate |
| Traffic to non-pinned domains (CDNs, analytics, third-party) | Pinning only covers `api.guildpass.xyz` and `staging.guildpass.xyz` |
| IP-level redirection that bypasses TLS entirely | Pinning operates at the TLS handshake, not the network layer |
| BGP hijacking with a server that has the pinned private key | Requires physical server key compromise |
| App binary modification to remove pinning | Requires root + binary patching (raised bar via Control 1) |
| Certificate transparency log poisoning | Out of scope; CT is a server-side concern |

### 5.3 Implementation Details

- **Native layer**: Android `network_security_config.xml` | iOS `NSAppTransportSecurity` with `NSPinnedDomains`.
- **JS layer** (`src/features/security/certificatePinning.ts`): Canonical pin set definition, domain validation, configuration validation.
- **Pin format**: SHA-256 hash of the SubjectPublicKeyInfo (SPKI), base64-encoded.
- **Backup pin**: Always maintain at least one backup pin to enable rotation without downtime.
- **Fail mode**: `failOpen: false` — connection is rejected if pin validation fails.

### 5.4 Assumptions

1. The native network security configuration is correctly applied via EAS Build.
2. The GuildPass API uses a stable public key (or rotates with the documented procedure).
3. The pin set in the app is updated BEFORE the server certificate changes.
4. Users update to new app builds in a timely manner (within pin overlap window).

---

## 6. Attack Trees

### 6.1 Intercept API Traffic

```
Goal: Intercept API traffic between GuildPass Mobile and api.guildpass.xyz
├── MITM with user-installed CA cert
│   └── [BLOCKED by certificate pinning] ← Control 2
├── Compromise a trusted CA
│   └── [BLOCKED by SPKI pinning] ← Control 2
├── DNS poison + valid cert for guildpass.xyz
│   └── [BLOCKED by SPKI pinning] ← Control 2
├── Modify app binary to remove pinning
│   ├── Need root access → [DETECTED by device integrity] ← Control 1
│   └── Bypass root detection → [DETECTION NOT GUARANTEED]
└── Steal server private key
    └── [OUT OF SCOPE — server-side security]
```

### 6.2 Tamper with Wallet / Attestation Flow

```
Goal: Intercept or modify wallet attestations
├── Hook into app process (Frida/Xposed)
│   └── [DETECTED by device integrity] ← Control 1
├── Modify app binary
│   ├── Need root/JB → [DETECTED] ← Control 1
│   └── Repackage + self-sign → Play Integrity / App Attest (future)
├── Exploit OS vulnerability
│   └── [OUT OF SCOPE — platform security]
└── Physical memory dump
    └── [OUT OF SCOPE — hardware security]
```

---

## 7. Residual Risk

The following risks remain after hardening and should be tracked:

| Risk | Severity | Mitigation Strategy |
|------|----------|---------------------|
| Sophisticated attacker bypasses root detection | Medium | Accept; layer with server-side attestation validation (roadmap) |
| Pin rotation mishap bricks connectivity | High | Pin rotation runbook + backup pin policy + phased rollout |
| Native config plugin not included in build | High | CI check that validates plugin presence |
| Traffic to non-pinned third-party domains | Low-Medium | Audit third-party dependencies; add pins for critical domains |
| Expo Go bypass in development | Low | Detect Expo Go and warn (not block) during development |

---

## 8. Future Improvements

| Improvement | Priority | Notes |
|-------------|----------|-------|
| Play Integrity / App Attest integration | High | Server-side verification of device + app integrity |
| Runtime integrity (checksum of JS bundle) | Medium | Detect tampered JS bundles |
| Certificate Transparency enforcement | Medium | Require CT for pinned domains |
| Obfuscation / anti-tamper (ProGuard/DexGuard) | Low | Raise reverse-engineering cost |
| Hardware-backed key attestation for wallets | High | Use Secure Enclave / StrongBox for key generation |

---

## 9. References

- [OWASP Mobile Top 10 (2024)](https://owasp.org/www-project-mobile-top-10/)
- [OWASP Certificate Pinning Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Pinning_Cheat_Sheet.html)
- [Android Network Security Config](https://developer.android.com/privacy-and-security/security-config)
- [iOS NSAppTransportSecurity](https://developer.apple.com/documentation/bundleresources/information_property_list/nsapptransportsecurity)
- [Pin Rotation Runbook](./pin-rotation-runbook.md)
- [SECURITY.md](../SECURITY.md)
