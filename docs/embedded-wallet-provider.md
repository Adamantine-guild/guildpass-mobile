# Embedded Wallet Provider Evaluation

> **Decision:** Privy (`@privy-io/expo`)  
> **Date:** 2026-07-27  
> **Status:** Adopted — integrated into `src/features/wallet/`

## Evaluation Criteria

| Criterion | Weight | Notes |
|---|---|---|
| React Native / Expo SDK maturity | Critical | Must have first-party Expo support; no bare-RN-only workarounds |
| Social login providers | High | Email + Google required; Apple required for App Store |
| Wallet provisioning model | High | Automatic on first login; no user ceremony |
| Custody / key security model | High | Must NOT be fully custodial; MPC or TEE preferred |
| Chain support | Medium | All EVM chains (GuildPass is EVM-only) |
| Cost at launch scale | Medium | Free tier or low-cost for <1000 MAU |
| Wallet export | Medium | Users should be able to extract their key if desired |

---

## Providers Evaluated

### Privy ✅ (Selected)

| Criterion | Assessment |
|---|---|
| **SDK** | `@privy-io/expo` — first-party, actively maintained, Expo-native. Already in `package.json` |
| **Social login** | Email OTP, Google, Apple, Twitter, Discord, GitHub, Farcaster |
| **Wallet provisioning** | `createOnLogin: "users-without-wallets"` — zero-ceremony Ethereum wallet creation |
| **Custody model** | **MPC 2-of-3 key splitting**: device share (Secure Enclave), Privy infra share (HSM-backed), recovery share (encrypted to user's auth factor). No single party ever holds the full private key |
| **Chain support** | All EVM chains |
| **Cost** | Free: 1,000 MAU. Growth plan: usage-based pricing |
| **Wallet export** | Supported — users can extract their full private key through the SDK |
| **Recovery** | Re-authenticate with same email/social account on any device |

**Why Privy:**
1. Only provider with a first-party, production-ready Expo SDK (`@privy-io/expo`)
2. MPC key model is the gold standard for embedded wallets — no seed phrase, no full custodial risk
3. `createOnLogin` config eliminates all wallet ceremony
4. Already integrated and partially wired in the codebase
5. Auth-factor-based recovery means users can't lose access by losing a device

### Web3Auth ❌

| Criterion | Assessment |
|---|---|
| **SDK** | `@web3auth/react-native-sdk` — available but heavier; requires additional native module configuration that conflicts with Expo managed workflow |
| **Social login** | Broad provider support |
| **Custody model** | Threshold key splitting (similar to MPC) |
| **Why not** | Heavier SDK footprint, more complex configuration, less Expo-native than Privy. Would require `expo prebuild` for native module linking |

### Magic (now Magic.link) ❌

| Criterion | Assessment |
|---|---|
| **SDK** | `@magic-sdk/react-native` — deprecated React Native SDK, limited maintenance |
| **Why not** | Deprecated RN SDK with no Expo-specific support. Would require significant custom bridging |

### Turnkey ❌

| Criterion | Assessment |
|---|---|
| **SDK** | Lower-level API; no React Native SDK. Requires building custom auth + wallet UI |
| **Why not** | Too low-level for a mobile app. Would require building the entire auth flow, wallet UI, and key management from scratch |

### Particle Network ❌

| Criterion | Assessment |
|---|---|
| **SDK** | `@particle-network/rn-auth` — available but less mature Expo support |
| **Why not** | Less mature Expo support compared to Privy. Smaller developer community |

---

## Security Model

### What Privy Protects Against

- **Seed phrase loss/theft**: No seed phrase exists. Key shares are distributed across device, Privy infrastructure, and an auth-factor-encrypted recovery share.
- **Device loss**: User re-authenticates with their email/social account on a new device to reconstruct their key.
- **Single point of compromise**: MPC ensures no single party (not Privy, not the device) ever holds the full private key.

### What Privy Does NOT Protect Against

- **Privy infrastructure compromise**: If Privy's HSM-backed infrastructure is breached AND the attacker obtains the device share, the key could be reconstructed. This is a fundamental trust trade-off of any embedded wallet provider.
- **Social account takeover + device theft**: An attacker who compromises both the user's auth factor (email/Google account) AND their device could potentially reconstruct the key.
- **Nation-state actors**: Out of scope, consistent with the project's [threat model](./threat-model.md).

### Alignment with GuildPass Threat Model

The existing [threat model](./threat-model.md) already documents "Future: embedded private keys" as a **Critical** asset with planned storage in `expo-secure-store` / Secure Enclave. Privy's device share leverages exactly this: the device key share is stored in the platform's hardware-backed secure enclave (iOS Keychain / Android Keystore), aligned with the existing security architecture.

---

## Integration Architecture

```
┌─────────────────────────────────────────────────────┐
│                 Onboarding Screen                    │
│  ┌─────────────────────────────────────────────────┐│
│  │  CustodyDisclosure (trade-off explanation)      ││
│  │  Email OTP / Google OAuth sign-in               ││
│  └─────────────────────────────────────────────────┘│
│                        │                             │
│                        ▼                             │
│  ┌─────────────────────────────────────────────────┐│
│  │  Privy SDK (useLoginWithEmail / useLoginWithOAuth)│
│  │  → auto-creates embedded Ethereum wallet        ││
│  │  → returns EVM address                          ││
│  └─────────────────────────────────────────────────┘│
│                        │                             │
│                        ▼                             │
│  ┌─────────────────────────────────────────────────┐│
│  │  createEmbeddedConnector(address)               ││
│  │  → same WalletConnector interface as manual/WC  ││
│  └─────────────────────────────────────────────────┘│
│                        │                             │
│                        ▼                             │
│  ┌─────────────────────────────────────────────────┐│
│  │  useWalletStore                                 ││
│  │  walletAddress = "0x...", connectionKind = "embedded" │
│  └─────────────────────────────────────────────────┘│
│                        │                             │
│                        ▼                             │
│  All downstream flows (memberships, guilds, access   │
│  checks, sync, attestations) see a standard EVM      │
│  address — completely provider-agnostic.             │
└─────────────────────────────────────────────────────┘
```

Key design principle: **Privy is only the provisioning layer.** Once the embedded wallet address enters `useWalletStore`, every downstream flow treats it identically to a manually-entered or WalletConnect address. No screen, hook, or service needs to know the wallet was provisioned by Privy.
