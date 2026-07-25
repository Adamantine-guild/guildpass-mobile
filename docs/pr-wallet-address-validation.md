# fix: enforce wallet address validation and normalisation

## Description

Invalid and malformed Ethereum wallet addresses were being accepted by `connectManually`, `setWalletAddress`, and the access-check screen with no validation or error feedback. Any string — including addresses that are too short, missing the `0x` prefix, contain non-hex characters, or are entirely empty — was stored in the wallet store with `isConnected: true`, causing downstream SDK queries to fail silently with no actionable message at the point of entry.

Mixed-case (EIP-55 checksum) addresses were also stored exactly as typed, which could cause inconsistent query results if the GuildPass SDK compares addresses case-sensitively.

### Root Causes Fixed

1. `connectManually` in `useWallet.ts` had a `// TODO: Add address validation` comment but no implementation
2. `setWalletAddress` in `wallet.store.ts` called `set(...)` unconditionally — any non-empty string set `isConnected: true`
3. `handleCheck` in `access-check.tsx` used only a truthy guard (`if (address && guildId && resourceId)`) before firing the SDK query
4. No centralised validation utility existed — each entry point was ad-hoc
5. No `.toLowerCase()` normalisation anywhere in the address storage path

### Fix Summary

A single `validateAndNormalizeAddress` utility (`src/lib/walletValidation.ts`) is the source of truth. It tests addresses against `/^0x[0-9a-fA-F]{40}$/` and returns a discriminated union `{ valid: true; address: string }` (lowercased) or `{ valid: false; error: string }`. This utility is applied at every entry point:

- `wallet.store.ts` — `setWalletAddress` returns early on invalid input, leaving state unchanged
- `useWallet.ts` — `connectManually` now returns `{ success: boolean; error?: string }` and rejects invalid addresses before touching the store
- `app/profile.tsx` — `handleConnect` reads the `connectManually` result and surfaces `error` via the existing `WalletInput` `error` prop; navigation is blocked on failure
- `app/access-check.tsx` — `handleCheck` validates the address before setting `checkParams`; inline error shown via `WalletInput`; button disabled when `addressError` is set

## Linked Issue

closes #26

## Type of Change

- [x] 🐛 Bug fix (screen or component)
- [x] 🧪 Tests only (additional test coverage added)

## Changes Made

- **`src/lib/walletValidation.ts`** _(new file)_ — `validateAndNormalizeAddress` utility
- **`src/features/wallet/wallet.store.ts`** — guard `setWalletAddress` with validation; store lowercase address
- **`src/features/wallet/useWallet.ts`** — implement validation in `connectManually`; return `{ success, error }`
- **`app/profile.tsx`** — replace manual partial check with `connectManually` result handling; show inline error
- **`app/access-check.tsx`** — validate address in `handleCheck`; add `addressError` state; wire to `WalletInput`
- **`tests/wallet.test.ts`** — 31 new/updated tests covering: bug condition exploration, preservation, unit tests for `validateAndNormalizeAddress` and `setWalletAddress`, PBT fix-checking, PBT preservation, PBT case-normalisation, and integration flows

## Screenshots / Recordings

This fix adds validation logic and inline error display to existing input fields. No new screens added.

| Before                                                             | After                                                                                                              |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| Invalid address `"0x123"` stored silently with `isConnected: true` | Invalid address rejected; "Please enter a valid Ethereum address (0x followed by 40 hex characters)." shown inline |
| Mixed-case `"0xAbCd..."` stored as-is                              | Normalised to `"0xabcd..."` before storage                                                                         |
| Access-check fires SDK query with any truthy address string        | Access-check blocked until address passes format validation                                                        |

## Test Evidence

```
 ✓ tests/wallet.test.ts (31 tests) 36ms
   ✓ Wallet Store (2)
   ✓ Preservation: Valid Address Behavior (3)
   ✓ Bug Condition: Invalid Address Rejection (exploration) (6)
   ✓ validateAndNormalizeAddress (8)
   ✓ setWalletAddress (fixed) (2)
   ✓ PBT: Bug Condition — Fix Checking (2)
   ✓ PBT: Preservation — Valid Address (2)
   ✓ PBT: Case Normalisation (1)
   ✓ Integration: Profile Flow (2)
   ✓ Integration: Access-Check Flow (3)

 Test Files  1 passed (wallet.test.ts)
      Tests  31 passed (31)
```

Note: `tests/api.test.ts` and `tests/components.test.tsx` fail with pre-existing parse errors (`SyntaxError: Unexpected token 'typeof'`) that are unrelated to this fix and existed before any changes were made.

## Checklist

- [x] I have read [CONTRIBUTING.md](../CONTRIBUTING.md)
- [x] This PR is linked to an open issue
- [ ] `pnpm typecheck` passes — note: 129 pre-existing TypeScript errors exist project-wide (NativeWind `className` not in RN types, missing `@guildpass/sdk` types). No new errors introduced by this fix.
- [ ] `pnpm lint` passes — note: pre-existing ESLint flat config incompatibility. No new lint issues introduced.
- [x] `pnpm test:run` passes — all 31 wallet tests green
- [x] No new UI screens added (validation errors use existing `WalletInput` `error` prop)
- [x] No native modules added
- [x] No secrets, keys, or wallet credentials included
- [x] No `.env` changes required
- [x] Accessibility: error messages rendered as adjacent `<Text>` elements next to input fields; existing `WalletInput` accessibility structure preserved

## Additional Notes

The `connectManually` return type changed from `void` to `{ success: boolean; error?: string }`. All callers in `profile.tsx` have been updated. The Zustand store's `setWalletAddress` type signature is unchanged — it still accepts `string` but now silently ignores invalid values (returns early). This is intentional: the store is a defensive last line of defence; UI-level callers should always go through `connectManually` to get actionable error messages.
