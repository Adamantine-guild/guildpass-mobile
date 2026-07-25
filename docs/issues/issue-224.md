# Issue #224 — Refactor Application State Management into Modular Feature-Based Stores

## Summary

This PR completes the feature-oriented state architecture by removing the
remaining cross-feature store reachthroughs and documenting the rules that
keep them out. The audit that opened this work found the store layer already
modular — eight feature-scoped stores, no server entity data in Zustand, no
Zustand/TanStack Query duplication — so the gap was not store organisation
but the writes that *span* stores: `useWallet` and `useSecurityInit` reached
directly into `useSessionStore`, `useSyncStore`, and the query cache, and
`useWallet.disconnect()` used a runtime `require()` of a React component
module to reach the live WalletConnect provider. Those fan-outs now live in a
single declared module, `src/lib/walletLifecycle.ts`, where the teardown
ordering is explicit, awaitable, and test-pinned. `useWallet` also moves from
a bare `useWalletStore()` subscription to atomic selectors, and
`docs/architecture.md` gains the store-ownership, cross-feature-write, and
selector guidelines contributors need.

## Changes Made

### `src/features/wallet/walletConnectSession.ts` (new)

Holds the live WalletConnect provider outside the React tree — a private
module-level ref behind `setWalletConnectProvider()` /
`getWalletConnectProvider()`, plus the `WalletConnectSessionProvider` type.
This replaces the module-level `_wcProviderRef` that lived inside
`WalletConnectProvider.tsx` and could only be reached from `useWallet` via
`require("./WalletConnectProvider")` at call time. Reading it from a plain
module keeps the WalletConnect modal package — and a React component — out of
`useWallet`'s module graph, and removes the last dynamic `require()` in the
wallet feature.

### `src/lib/walletLifecycle.ts` (new)

The declared home for wallet-related state transitions that span features:

- **`startWalletSession(address)`** — authenticates through the session
  store's configured adapter. Every connect path (manual, embedded,
  connector, WalletConnect bridge) now calls this instead of reaching into
  `useSessionStore` itself.
- **`endWalletSession()`** — drops the wallet-scoped query cache, clears sync
  metadata and unacknowledged corrections, then ends the session. **The order
  is the contract**: a screen still mounted during teardown must not be able
  to refetch against a live token and repopulate the outgoing wallet's cache.
  Expressing this as a plain awaitable function rather than an event emitter
  is what makes the ordering both guaranteed and testable.
- **`invalidateSessionForCompromise()`** — session invalidation after a
  device-integrity compromise under the `block` policy. Deliberately narrower
  than `endWalletSession`: it ends the session without clearing the
  wallet-scoped cache, matching the behaviour that shipped before this module
  existed. See Notes.

### `src/features/wallet/useWallet.ts` (updated)

- Replaced the bare `useWalletStore()` destructure with six atomic selectors
  (`walletAddress`, `isConnected`, `connectionKind`, `_hasHydrated`,
  `setWalletAddress`, `disconnect`). The bare call returned a new state object
  on every `set()`, re-rendering all eight consumers even when no consumed
  value had changed — and `WalletConnectProvider` rewrites the same address on
  each run of its bridge effect, so this was a real cost, not a theoretical
  one.
- Dropped the imports of `useSessionStore`, `useSyncStore`, `queryClient`, and
  `clearWalletScopedCache`; the three connect paths call `startWalletSession`
  and `disconnect` calls `endWalletSession`.
- `disconnect` now `await`s the teardown instead of firing `endSession()` as a
  floating promise, and clears the wallet feature's own store before handing
  off to the cross-feature teardown.
- Removed the `require("./WalletConnectProvider")` call in favour of the
  static import from `walletConnectSession.ts`.

### `src/features/wallet/WalletConnectProvider.tsx` (updated)

- The module-level `_wcProviderRef` and its `getWalletConnectProvider()`
  export move to `walletConnectSession.ts`; the bridge effect now calls
  `setWalletConnectProvider(provider)` and clears it on cleanup.
- The connect effect calls `startWalletSession(address)` instead of pulling
  `startSession` off `useSessionStore.getState()`. The component no longer
  imports another feature's store.

### `src/features/security/useSecurityInit.ts` (updated)

Compromise handling calls `invalidateSessionForCompromise()` instead of
`useSessionStore.getState().endSession()`, removing the security feature's
direct dependency on the session store. Behaviour is unchanged by
construction.

### `docs/architecture.md` (updated)

Expanded the one-line "Global Client State" bullet into a full State
Management section, pointing at `MIGRATION_STATE.md` as the deep reference
for layering and query keys while covering what contributors need at write
time:

- **Golden rule** — server entity data never enters Zustand; store an id and
  resolve the entity through React Query at render time.
- **Store ownership table** — all eight stores, their locations, what each
  owns, and persistence backing.
- **Cross-feature writes** — a feature imports only its own store; spanning
  writes are declared in `src/lib/walletLifecycle.ts` or
  `src/lib/resetAppState.ts`, including why `endWalletSession`'s order
  matters.
- **Selectors** — subscribe atomically, never bare, with the re-render
  rationale and the narrow conditions under which `useShallow` would apply.

### `tests/walletLifecycle.test.ts` (new, 6 tests)

Drives the module against the real session, sync, and query-cache
collaborators using a fake `SessionAdapter` whose `signOut` callback observes
state *at sign-out time*. Covers: adapter-backed authentication;
`endWalletSession` clearing wallet-scoped queries, sync state, and the
session; non-wallet-scoped queries surviving; and the two ordering
guarantees — cache dropped before sign-out, sync cleared before sign-out.
Also pins `invalidateSessionForCompromise` ending the session while leaving
the membership cache intact, so the narrower behaviour cannot be widened
silently.

### `tests/useWallet.test.tsx` (new, 4 tests)

A render-counting harness over `useWallet` via `react-test-renderer`
(already a direct devDependency and the pattern used by 22 existing test
files, including `tests/walletRequired.test.tsx`). Asserts no re-render on a
no-op `setWalletAddress` with the current address, no re-render when
hydration is re-flagged at its current value, a re-render when the address
actually changes, and that the public surface consumers destructure is
unchanged by the selector refactor.

### `tests/walletConnectSession.test.ts` (new, 3 tests)

Registration lifecycle of the out-of-tree provider ref: null before
registration, returns the registered provider, null once cleared.

## Acceptance Criteria Met

- [x] **Feature modules own only their respective client state.** Partly
      satisfied before this PR: all eight stores were already feature-scoped
      (`features/wallet`, `session`, `sync`, `notifications`, `access`,
      `security` ×2, `network`), each 38–173 lines with a single
      responsibility. What was outstanding was consumers reaching *across*
      that boundary — `useWallet` importing `useSessionStore` and
      `useSyncStore`, `useSecurityInit` importing `useSessionStore`,
      `WalletConnectProvider` importing `useSessionStore`. All four are now
      removed; each of those modules imports only its own feature's store.
- [x] **Cross-feature dependencies are minimized.** Every wallet-spanning
      write now goes through `src/lib/walletLifecycle.ts`, joining the
      existing `src/lib/resetAppState.ts`. The fan-out is declared in one
      ordered, awaitable place rather than inlined across three call sites,
      and `useWallet.disconnect()` no longer performs a runtime `require()`
      of a React component module.
- [x] **Derived state duplication is eliminated.** Already satisfied before
      this PR, and re-verified by the audit rather than changed: no server
      entity data (guilds, roles, memberships) is held in Zustand, and no
      value is duplicated between a Zustand store and the TanStack Query
      cache. The server/client boundary rule this rests on is stated in
      `MIGRATION_STATE.md`; this PR restates it as the "Golden rule" in
      `docs/architecture.md` so it is discoverable at the point of writing
      new state.
- [x] **Performance is maintained or improved.** Improved at the one measured
      regression: `useWallet` was the sole remaining hot-path bare
      subscription, re-rendering all eight consumers on every wallet store
      write. The other 21 store call sites across `src/` and `app/` already
      used atomic selectors and were left alone. `tests/useWallet.test.tsx`
      pins the improvement so it cannot silently regress.
- [x] **Architecture documentation reflects the new state organization.** The
      new State Management section in `docs/architecture.md` documents the
      golden rule, the store-ownership table, the cross-feature-write
      convention, and the selector guideline.

## Notes

- The issue's "Likely affected files/directories" list names `src/store/`,
  `src/providers/`, and `src/hooks/`. **None of these exist in the
  repository** — state is already organised under `src/features/<domain>/`.
  This is the main reason the PR is smaller than the issue implies: the
  refactor it anticipates (a monolithic `src/store/` split into feature
  modules) had already happened incrementally as features landed.
- Steps 1–3 of the suggested implementation — audit the stores, define the
  server/client ownership boundary, split large stores — were executed as an
  audit and closed as already-satisfied rather than as code changes. All
  eight stores are feature-scoped, 38–173 lines, with single
  responsibilities. **No store was split**: none is large enough or
  multi-purpose enough for splitting to be anything but churn, and splitting
  a persisted store is a migration cost paid for no benefit.
- **`useShallow` was deliberately not introduced.** It earns its indirection
  only when a selector must return a *newly constructed* object or array,
  the single case `Object.is` equality cannot handle. No selector in the
  codebase does; wrapping atomic selectors that return primitives or stable
  action references would add indirection with no effect on re-render counts.
  The conditions under which a future contributor *should* reach for it are
  documented in `docs/architecture.md`.
- One bare subscription remains by choice: `src/features/session/useSession.ts`
  calls `useSessionStore()` to build its facade. It is not on a hot re-render
  path the way `useWallet` was, and converting it is cosmetic; the selector
  guideline is documented for when it or its consumers change.

### Discrepancies recorded, not fixed

- **`MIGRATION_STATE.md` documents `src/database/` as a live persistence
  layer**, but the module has no callers outside itself — `app/_layout.tsx`
  persists the query cache through `asyncStoragePersister`
  (`src/lib/queryPersister`) instead. Either the documentation is stale or
  the layer is unwired; resolving it means deciding which, and that is a
  persistence-architecture question rather than a state-ownership one.
  **Deferred to #225.**
- **Security-triggered logout leaves the wallet-scoped query cache and sync
  corrections intact.** When device-integrity checks force a sign-out under
  the `block` policy, only the session is ended — cached membership and role
  data for the wallet remains readable. `invalidateSessionForCompromise()`
  preserves this deliberately, so that this refactor is behaviour-neutral,
  and `tests/walletLifecycle.test.ts` pins it explicitly rather than leaving
  it as an accident of implementation. Widening it to a full
  `endWalletSession()` teardown is a **security behaviour change** and needs
  its own issue, its own reasoning about what a compromised device should
  retain, and its own review.

## Test Results

- **495 passing / 22 failing across 65 files**, versus a baseline of
  **482 passing / 22 failing across 62 files** — +13 tests, +3 files, and no
  change in failures.
- The 22 failures are the identical pre-existing ones (`tests/database/`
  schema table/index assertions and related), none in files this PR touches.
- The full suite OOMs on Vitest's default pool in a 2-core Codespace
  (`ERR_WORKER_OUT_OF_MEMORY`), so results were measured in batches plus the
  colocated `src/features/access/qrPayload.test.ts`. This is an environment
  constraint, not a regression introduced here.
- `pnpm typecheck` and `pnpm lint` are unchanged against baseline (213
  errors / 98 problems). No new error or warning is attributable to this PR
  beyond one `@typescript-eslint/array-type` warning in
  `tests/walletLifecycle.test.ts`. The pre-existing `TS2307` unresolved
  imports in `useSecurityInit.ts` are untouched — the one import this PR adds
  to that file uses the correct relative depth (`../../lib/walletLifecycle`)
  rather than matching its broken siblings.

Closes #224
