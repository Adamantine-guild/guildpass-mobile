# Issue #226 — Design and Implement a Modular Plugin Architecture for Future GuildPass Integrations

## Summary

This PR adds extension points where the codebase actually has more than one
implementation to abstract over, and documents the seams where it does not. An
audit of the four integration points the issue names found them in very
different states: credential providers had **no shared interface and two
independently duplicated implementations** of issuer-key resolution and
fail-closed offline revocation; wallets had a `WalletConnector` interface that
the embedded (Privy) path bypassed by writing to the store directly, plus a
hardcoded support table with `coinbase` and `metamask` pinned to `false`;
verification services were already dependency-injected per call; and auth
providers had a clean `SessionAdapter` interface with exactly one stub
implementation.

So the work is scoped by implementation count rather than by the issue's
category list. Credential issuers and wallet connectors get real registries.
Verification sources and session adapters get documentation of the seam that
already works, and deliberately no registry — building one over a single stub
would be indirection with nothing behind it.

Throughout, behaviour is preserved exactly. Both credential paths keep their
fail-closed policy, their distinct trust-window boundaries, and — critically —
their asymmetry: the QR path keeps refreshing over the network on TTL expiry,
and the attestation path stays no-network.

## Changes Made

### `src/lib/credentials/` (new module)

- **`credentialIssuer.types.ts`** — the shared contract.
  `CredentialIssuerRegistry` exposes `lookupIssuerKey()` and `isRevoked()` over
  an `IssuerKeyRef` that is either a key id (`kid`) or an issuer address. The
  interface **returns** outcomes rather than throwing: `IssuerKeyLookup` is a
  discriminated union of `active` / `revoked` / `unknown` / `unavailable`, and
  `isRevoked` returns `boolean | null`. That is what made adoption
  behaviour-neutral — each feature keeps a thin mapper back to its own existing
  error convention, so no caller and no existing test changed.
- **`registryFreshness.ts`** — `classifyRegistryFreshness()`, the one genuinely
  identical piece of both implementations: given a snapshot's age, is it
  `fresh`, `stale_trusted`, or `expired`? `FreshnessPolicy.trustWindowBoundary`
  is **required with no default**, so a future caller must state whether its
  trust window is inclusive or exclusive instead of silently inheriting one.
- **`credentialRegistry.ts`** — discovery map keyed by `CredentialKind`, with
  `register` / `get` / `tryGet` / `list` / `reset`. Re-registering a kind
  replaces it rather than throwing, so bootstrap is idempotent.
- **`registerBuiltInIssuers.ts`** — explicit bootstrap registration of both
  shipped implementations, called from `app/_layout.tsx` rather than run as an
  import side-effect, so test suites control when registration happens.

### `src/features/access/guildIssuerKey.ts` (updated)

- Registry resolution moves into `resolveGuildKeyRegistry()`, which *reports*
  failure instead of throwing. `getGuildKeyRegistry()` is now a thin wrapper
  that re-throws the identical `QrSignatureError` code and message, and
  `getGuildIssuerPublicKey()` maps lookup statuses back to `REVOKED_KEY`,
  `UNKNOWN_KEY`, `MISSING_KID`, `KEY_REGISTRY_EXPIRED`, and
  `PUBLIC_KEY_UNAVAILABLE` with their original wording.
- The TTL / trust-window arithmetic now calls `classifyRegistryFreshness()` with
  an **inclusive** boundary, matching what this path has always done.
- Adds `qrAccessIssuerRegistry`. The network refresh on TTL expiry is unchanged.
- `verifyQrPayload.ts` is untouched.

### `src/features/attestation/issuerKeyRegistry.ts` (updated)

- Adds `attestationIssuerRegistry`. `isRevoked` holds the revocation-lookup
  logic; `checkIssuerKeyRevoked()` is now a delegate that still returns
  `boolean | null`, so `verifySignature.ts` and the `REVOCATION_DATA_UNAVAILABLE`
  fail-closed path are untouched.
- `lookupIssuerKey` is implemented over `getCachedIssuerKey()`, checking the
  supplied reference's revocation status *before* resolving key material — a
  revoked address reports `revoked`, not `unknown`.
- The two cache tiers now use named `FreshnessPolicy` constants that preserve
  their differing boundaries: **inclusive** in memory, **exclusive** when
  persisted. The one-millisecond difference is documented rather than unified,
  because narrowing or widening when a verifier stops accepting attestations
  offline is a security change, not a refactor.
- This path still performs **no network I/O**. Revocation data continues to
  arrive via `cacheAttestationRevocationRegistry()` during online verification,
  which is why the revocation check can run ahead of signature verification.

### `src/features/wallet/walletConnectorRegistry.ts` (new)

Descriptor registry replacing `connectorFactories: Record<WalletConnectorType,
boolean>`. Descriptors rather than factories because construction arguments are
heterogeneous — a `Map<type, factory>` would erase them to `unknown` for no
caller's benefit. `coinbase` and `metamask` are simply not registered, so they
report unsupported instead of being listed as `false`.

The module imports nothing but its own types. That is load-bearing:
`walletConnector.service` re-exports from it, so anything this module pulls in
reaches every consumer — an initial version that imported `appConfig` dragged
Flow-typed `expo-constants` into suites Vite could not parse and broke
`session-and-connector.test.ts`.

### `src/features/wallet/walletConnector.service.ts` (updated)

Adds `createEmbeddedConnector(address)`, shaped like the manual connector
because the address is likewise already known — the provider's sign-in happens
in `EmbeddedWalletOnboarding`, and its only application output is that address.
Re-exports `isConnectorTypeSupported` from the registry so existing importers
keep working.

### `src/features/wallet/walletConnector.types.ts` (updated)

Adds `"embedded"` to `WalletConnectorType`. It was already in
`WalletConnectionKind`; the missing connector-type member was the actual reason
the embedded path could not go through the connector interface.

### `src/features/wallet/useWallet.ts` (updated)

`connectEmbeddedWallet` now builds an embedded connector and calls
`connectWithConnector`, instead of validating and writing to the store itself.
Observably identical: the same normalized address, the same `embedded`
connection kind, and the same validation error strings.

### `app/_layout.tsx` (updated)

Calls `registerBuiltInIssuers()` alongside `initConnectivityService()`,
`initSyncManager()`, and `initFocusManager()`.

### `docs/architecture.md` (updated)

New **Extension Points** section covering all four integration points, the
registry-vs-interface rule, the fail-closed contract, the QR/attestation
mechanism table, and how to add each kind of integration. Rewrites the stale
**Future Wallet Integration Path** section, which still described WalletConnect
and embedded wallets as future work after both had shipped.

### `tests/credentials/` (new, 36 tests)

- **`registryFreshness.test.ts`** (11) — TTL and trust-window boundary table,
  including the inclusive/exclusive divergence asserted side by side so a future
  unification fails loudly, plus clock-skew behaviour.
- **`credentialRegistry.test.ts`** (7) — registration, independence of kinds,
  duplicate registration replacing rather than throwing, strict vs non-throwing
  lookup of an unregistered kind, reset.
- **`issuerRegistryContract.test.ts`** (18) — one conformance suite run against
  **both** implementations via `describe.each`: active resolution, revoked
  references, definitive `isRevoked`, fail-closed `unavailable`/`null` when
  nothing is resolvable, never throwing, and `null` for a reference shape the
  implementation cannot answer. Also asserts `registerBuiltInIssuers()` is
  idempotent and that **both verification paths still fail closed before it has
  run** — the guarantee that keeps gating independent of bootstrap ordering.

### `tests/walletConnectorRegistry.test.ts` (new, 10 tests)

Built-in support, unimplemented connectors reporting unsupported *and* not being
registered at all, module-load seeding (so support does not depend on
bootstrap), the service module's re-export agreeing, registering a new connector
without touching core, availability re-evaluated per call, duplicate
registration replacing, and reset restoring the built-in set.

### `tests/embeddedConnector.test.tsx` (new, 5 tests)

`createEmbeddedConnector` satisfying the `WalletConnector` interface, address
normalization and `embedded` connection kind through `connectEmbeddedWallet`,
malformed and empty addresses leaving the store untouched, and — the
behaviour-preservation assertion — identical store state whether the embedded
address goes through `connectEmbeddedWallet` or `connectWithConnector` directly.

## Acceptance Criteria Met

- [x] **Integration interfaces are clearly defined and documented.**
      `CredentialIssuerRegistry` and `WalletConnectorDescriptor` are new;
      `WalletConnector` and `SessionAdapter` already existed and are now
      documented as extension points. All four are covered in
      `docs/architecture.md` → **Extension Points**, including the fail-closed
      contract and lifecycle expectations.
- [x] **Existing functionality continues working through the new abstractions.**
      The proof is that nine suites needed **no edits**:
      `guildIssuerKey.test.ts`, `attestation.test.ts`, `qrSignature.test.ts`,
      `verifyAndParseQrPayload.test.ts`, `qrKeyRotation.test.ts`,
      `session-and-connector.test.ts`, `accessDecisionPipeline.test.ts`,
      `wallet.test.ts`, `useWallet.test.tsx`. If a refactor of this shape needs
      to edit them, it has changed behaviour.
- [x] **New integrations can be introduced without modifying core application
      logic.** A credential kind is added by implementing the interface and
      registering it; a wallet by exporting a factory and registering a
      descriptor. The `coinbase`/`metamask` hardcoded `false` entries — the one
      place that literally required editing core — are gone.
- [x] **Architecture documentation explains the extension model.** Including the
      cases where the answer is deliberately "no registry", with the reasoning.
- [x] **Automated tests verify plugin registration and integration behavior.**
      `credentialRegistry.test.ts` and `walletConnectorRegistry.test.ts` cover
      registration; `issuerRegistryContract.test.ts` covers integration
      behaviour by running one contract suite against both implementations.

## Notes

- The issue's affected-directories list names `src/providers/`, `src/services/`,
  and `src/utils/`. **None exist**, and none were created. Cross-feature concerns
  live in `src/lib/` and feature-local ones in `src/features/<domain>/`, the
  precedent set by #224 (`resetAppState.ts`, `walletLifecycle.ts`).
  `src/lib/credentials/` is shared by `features/access` and
  `features/attestation`; `walletConnectorRegistry.ts` is consumed only inside
  `features/wallet` and stays there.
- **The global credential registry is for discovery only, and the live
  verification paths deliberately do not use it.** `getGuildIssuerPublicKey()`
  and `checkIssuerKeyRevoked()` call their own module-local registry objects
  directly. Routing access gating through `getCredentialIssuerRegistry()` would
  make it depend on bootstrap ordering — a credential checked before
  registration ran would *throw* rather than fail closed, and a deep link can
  reach a verification path before the root layout finishes mounting. Discovery
  may depend on bootstrap; gating may not. This is asserted, not just documented.
- **The two credential registries share an interface, not an implementation.**
  The QR path refreshes over the network; the attestation path never does. A
  shared implementation would have to add a network call to the attestation path
  — contradicting the documented contract that lets its revocation check run
  before the expensive signature check — or remove the refresh from the QR path.
  Either is a behaviour change disguised as a refactor.
- **`trustWindowBoundary` has no default.** The QR path and the attestation
  in-memory tier are inclusive; the attestation persisted tier is exclusive. The
  difference is one millisecond wide and matters only at the exact boundary, but
  it decides when a verifier stops accepting credentials offline, so every
  caller states it explicitly.
- **A third freshness policy was left alone.** `getCachedIssuerKey()` carries its
  own 7-day staleness window and measures it against `Date.now()` rather than an
  injected clock. Only the revocation tiers were unified; folding in the
  issuer-key cache would change attestation verification behaviour.
- **No registry for verification sources.** `accessDecisionPipeline.ts` already
  injects `backendCheck` / `rpcResolver` / `attestationVerifier` per call, with
  no global state and no init ordering. Its policy is not generic over N sources
  — backend is authoritative and each other source corroborates it with its own
  named confidence levels — so a registry would feed a list into a hardcoded
  three-branch cascade and adding a source would still mean editing the
  confidence taxonomy. The bottleneck is the taxonomy, not the injection.
- **No registry for auth providers.** `SessionAdapter` has one implementation,
  the `noopSessionAdapter` stub. `setAdapter()` has no production caller, but
  `session-and-connector.test.ts` swaps in three different adapters and asserts
  the store behaves correctly for each — the seam is already exercised and
  proven. A registry over one stub is speculative generality.
- **No coinbase/metamask connectors.** Implementing them means adding SDK
  dependencies; the registry makes that additive later.
- **No plugin lifecycle or teardown hooks, and no dynamic loading.** Nothing
  needs ordering beyond what `walletLifecycle.ts` already covers, and React
  Native bundles statically — there is no code-push mechanism for runtime
  plugins to arrive through.
- The connector registry answers "does this build ship an implementation?", not
  "is it configured right now". Runtime configuration gating stays in
  `isEmbeddedWalletEnabled`. `isAvailable` remains on the descriptor for future
  connectors that can gate themselves without dragging config imports into every
  consumer's module graph.

## Test Results

- **546 passing / 22 failing across 70 files**, versus a baseline of
  **495 passing / 22 failing across 65 files** — +51 tests, +5 files, and no
  change in failures.
- The 22 failures are the identical pre-existing ones (`tests/database/` schema,
  DAL and migration assertions; one `accessDecisionPipeline` strict-mode reason
  string; one `wallet.test.ts` validation message; one `onboarding.test.tsx`
  render), none in files this PR touches.
- `pnpm typecheck`: **212 errors, unchanged**. No error is attributable to any
  new or modified file.
- `pnpm lint`: **96 problems (13 errors, 83 warnings)** versus a baseline of 98
  — two fewer, from deleting the hardcoded connector table and its now-unused
  type import. No new errors.
- The suite is measured in **9 batches of 8 files with `--no-file-parallelism`**.
  A single full run exhausts the heap on a 2-core Codespace
  (`ERR_WORKER_OUT_OF_MEMORY`), which also silently drops whole files from the
  count. This is a pre-existing environment/config problem — `vitest.config.ts`
  supersedes `vitest.config.js` but omits its `exclude` list, so files that
  config deliberately skipped now run — and is not addressed here.

Closes #226
