# Issue #104 — Implement Social Login / Embedded Wallet Onboarding Flow

## Summary

Adds a parallel onboarding branch for non-crypto-native users: "Get started
without one" authenticates via a social/email identity and provisions an
embedded wallet behind the scenes. The provisioned address flows through the
**same** connector interface, validation, wallet store, and session path as
manual entry and future WalletConnect — no special-casing anywhere downstream
(guilds, membership, access checks, and route guards all work unchanged).

The provider layer is SDK-agnostic: a `local-preview` provider ships today
(mirroring the repo's `noopSessionAdapter` / WalletConnect-stub conventions),
and a production Web3Auth/Privy-style integration drops in behind the same
interface without touching UI or connector code.

## Changes Made

### `src/features/wallet/embeddedWallet.types.ts` (new)

- `EmbeddedWalletProvider` interface (`login` / `provisionWallet` / `logout`),
  `SocialIdentity`, `SocialLoginMethod` (`email` | `google` | `apple`),
  `EmbeddedWalletRecord` with a custody tag (`device` | `custodial` | `mpc`).

### `src/features/wallet/embeddedWallet.provider.ts` (new)

- `localEmbeddedWalletProvider`: validates + normalizes the email (zod) and
  derives a **deterministic** preview address (same email ⇒ same wallet on
  every device/session). Google/Apple methods fail loudly until a production
  provider is configured — same pattern as the WalletConnect stub.
- **Nothing is persisted**: no keys, no identity records, no email — the only
  stored artifact of social onboarding is the derived address in the shared
  wallet store (see SECURITY.md).
- **Fail-closed production tripwire**: the preview provider refuses to run
  when `EXPO_PUBLIC_APP_ENV=production`, so a release build cannot ship
  unverified social onboarding by accident.
- `getEmbeddedWalletProvider()`: the single swap-in point for a real provider.

### `src/features/wallet/walletConnector.types.ts`, `walletConnector.service.ts` (updated)

- New `"embedded"` connector type and `createEmbeddedConnector(provider,
  method, params)` implementing the standard `WalletConnector` lifecycle
  (connect/reconnect/getAccounts/disconnect), so the social path reuses
  `connectWithConnector` unchanged.

### `src/features/wallet/useWallet.ts`, `src/lib/resetAppState.ts` (updated)

- `connectWithSocial(method, params)` convenience wrapper —
  `connectWithConnector(createEmbeddedConnector(...))`.
- Connecting over an existing connection now clears the previous wallet's
  scoped query cache (membership/user-roles), so switching wallets without an
  explicit disconnect can no longer leak one wallet's data to the next.
- Wallet disconnect and full app reset call `provider.logout()`
  unconditionally (idempotent), so a production provider's session/key-share
  revocation is wired into the lifecycle from day one.

### `app/onboarding.tsx` (updated), `app/social-onboarding.tsx` (new), `app/_layout.tsx` (updated)

- Onboarding now offers two clearly-labelled paths: **"I have a wallet"**
  (existing manual flow, same testID so existing E2E flows keep passing) and
  **"Get started without one"** (new social branch).
- The social onboarding screen takes an email (via a new shared
  `src/components/LabeledInput.tsx`, which `WalletInput` now also renders
  through, so input chrome stays in one place), shows provisioning state and
  errors, explains the custody model in-line, links back to the
  bring-your-own-wallet path, and lands on the standard connected profile.

### `SECURITY.md` (updated)

- New "Embedded Wallet Key Custody (Social Login Onboarding)" section: what
  the preview provider does and deliberately does not do (no key material,
  unverified identity, non-signing preview address), plus five hard
  requirements a production Web3Auth/Privy integration must meet (verified
  OIDC identity, MPC/hardware-backed custody, no key material in the JS
  layer, session binding, recovery/revocation).
- Two new in-scope report categories (embedded key-material exposure,
  social-identity impersonation).

### `tests/embeddedWallet.test.ts` (new, 14 tests)

- Deterministic derivation (valid per the shared validator, stable, distinct
  per identity), provider contract (email normalization, invalid-email and
  not-configured errors, production tripwire, nothing-persisted custody
  promise), connector lifecycle incl. provider logout on disconnect, and
  acceptance tests exercised through the **real `useWallet` hook**:
  `connectWithSocial` connects via the shared connector → store → session
  path, surfaces validation errors, clears the previous wallet's scoped
  cache on switch, and disconnect revokes the provider session.

### `.maestro/07-social-onboarding.yaml` (new), `.maestro/README.md`, `.maestro/QUICKSTART.md` (updated)

- E2E flow: onboarding → "Get started without one" → email entry → connected
  profile showing the provisioned address.

### `docs/architecture.md` (updated)

- "Future Wallet Integration Path" now documents the embedded-wallet seam.

## Acceptance Criteria Met

- [x] New onboarding path produces a valid, usable wallet address recognized
      by the rest of the app without special-casing (flows through the shared
      `WalletConnector` → `connectWithConnector` → wallet store path;
      verified by unit test and E2E flow).
- [x] Clear UX distinguishes "I have a wallet" vs. "Get started without one"
      (two labelled buttons on onboarding; the social screen also offers a
      way back to the BYO-wallet path).
- [x] Security review notes added to SECURITY.md regarding the embedded key
      custody model.

## Notes

- The preview provider intentionally performs no real OAuth, holds no key
  material, and persists nothing — the derived address cannot sign
  transactions, which keeps the security exposure of the unverified-email
  flow equal to the existing manual-address-entry MVP behavior, and it
  refuses to run in production builds. SECURITY.md documents the
  requirements a production provider must meet before replacing it.
- Adding Google/Apple buttons to the UI is deliberately deferred until a
  production provider is wired; the methods exist in the type system and fail
  with an actionable message if invoked.

Closes #104
