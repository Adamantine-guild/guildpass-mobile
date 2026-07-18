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
- Exposure of embedded-wallet key material or provisioning records outside secure storage
- Authentication or access-gate bypass via deep links or URL schemes
- Impersonation of a social-login identity to obtain another user's embedded wallet
- Insecure storage of sensitive user data on device
- Man-in-the-middle vulnerabilities in API calls to guildpass-core
- XSS-equivalent attacks via WebView components (if used)

**Out-of-scope:**

- Vulnerabilities in guildpass-core backend — report to that repo
- Expo SDK / React Native platform vulnerabilities — report to their maintainers
- Physical device security (e.g., screen lock bypass)

## Embedded Wallet Key Custody (Social Login Onboarding)

The "Get started without one" onboarding path provisions an **embedded
wallet** for users who authenticate with a social/email identity instead of
bringing their own wallet. Review notes on the custody model:

### Current state — `local-preview` provider

The shipped provider (`src/features/wallet/embeddedWallet.provider.ts`) is a
preview implementation that mirrors the app's MVP conventions (manual address
entry, no-op session adapter):

- **No private key exists.** The wallet address is derived deterministically
  from the normalized social identity (e.g. the email address). It is a valid
  address format that exercises the app's read-only membership and
  access-check flows, but it **cannot sign transactions** and controls no
  on-chain assets. The derivation is non-cryptographic (hash expansion) and
  offers no collision guarantee — acceptable only because the address
  carries no authority.
- **Nothing is persisted by the provider.** No secrets, mnemonics, key
  shares, identity records, or email addresses are written anywhere — not to
  secure storage, AsyncStorage, or logs. The only stored artifact of social
  onboarding is the derived address in the same wallet store every connector
  uses.
- **Identity is not verified.** There is no OAuth round-trip or email
  ownership proof in the preview provider; anyone who types an email obtains
  the same derived preview address. This is acceptable only because the
  address carries no signing authority and gates nothing beyond what manual
  address entry already allows.
- **Production tripwire.** The preview provider refuses to run when
  `EXPO_PUBLIC_APP_ENV=production`, so a release build cannot silently ship
  unverified social onboarding.
- **Lifecycle hooks are already wired.** Wallet disconnect and full app
  reset call `provider.logout()` unconditionally, so a production provider's
  local session/key-share revocation happens automatically once it is
  swapped in.

### Requirements for a production provider (Web3Auth / Privy / similar)

A real integration must implement the same `EmbeddedWalletProvider` interface
and satisfy all of the following before the preview provider is replaced:

1. **Verified identity.** Social login must complete a real OIDC/OAuth flow;
   the wallet must bind to the verified subject, never to unauthenticated
   user input.
2. **Key custody.** Prefer MPC/TSS providers where no single party (including
   the provider) holds a complete key. If any key share is kept on-device, it
   must live exclusively in hardware-backed secure storage
   (Keychain/Keystore via expo-secure-store), never in AsyncStorage, Redux/
   Zustand persisted state, or the React Query cache.
3. **No key material in the JS layer longer than necessary.** Signing should
   happen inside the provider SDK; the app should only ever see addresses and
   signatures.
4. **Session binding.** Replace the no-op session adapter for embedded users
   so that access tokens are tied to the verified social identity, and revoke
   local key shares on `logout()`/`disconnect()`.
5. **Recovery and revocation.** Document the account-recovery path (provider
   dashboard, share reconstruction) and what happens when a social account is
   compromised.

The custody tag on each provisioning record (`device` / `custodial` / `mpc`)
exists so future UI can disclose the active custody model to the user.

### Disclosure Policy

- We ask for a **90-day** coordinated disclosure window.
- We will credit reporters in release notes unless you prefer anonymity.

Thank you for helping keep GuildPass secure.
