<!-- GuildPass Mobile: Documentation section layout header reference. -->

# Mobile App Architecture

GuildPass Mobile follows a feature-based architecture combined with Expo Router for navigation.

<!-- GuildPass Mobile: Informational section content header block. -->

## Navigation & Routing

We use **Expo Router**, which provides file-system based routing similar to Next.js.

- `app/_layout.tsx`: Root layout provider (QueryClient, Providers).
- `app/index.tsx`: Initial entry point with redirect logic.
- `app/onboarding.tsx`: User welcome and intro.
- `app/profile.tsx`: Main wallet/account management.
- `app/guilds/`: Guild listing and detail views.

<!-- GuildPass Mobile: Documentation section layout header reference. -->

## State Management

1. **Server State**: Managed by **React Query**. All protocol data (guilds, memberships, access) is fetched and cached here.
2. **Global Client State**: Managed by **Zustand**, in feature-scoped stores (see below).
3. **Local State**: Standard React `useState` for form inputs and transient UI toggles.

`MIGRATION_STATE.md` is the canonical deep reference for the layering, the query-key
factory, and cache-coherence mechanisms. This section covers store ownership and the
rules contributors need when adding state.

Encrypted React Query persistence owns key-rotation migration. `KeyManager` does
not overwrite an existing stale key during standalone initialization; the encrypted
persister first re-encrypts the stored `gp1:` cache envelope with the candidate key,
then commits that key. If re-encryption cannot complete, rotation is deferred and
the existing cache remains readable.

### Golden rule

Server entity data (guilds, roles, memberships) never goes into Zustand. Zustand holds
only client state that has no server equivalent. Store an entity `id` and resolve the
entity through React Query at render time rather than copying a snapshot into a store.

### Store ownership

Each store lives in the feature that owns it and is the only owner of its state.

| Store | Location | Owns | Persistence |
| ----- | -------- | ---- | ----------- |
| `useWalletStore` | `features/wallet/wallet.store.ts` | Connected address, connection status, connector kind, cryptographic verification state (`isVerified`) | SecureStore |
| `useSessionStore` | `features/session/session.store.ts` | Auth status, token, expiry, session adapter | SecureStore |
| `useSyncStore` | `features/sync/sync.store.ts` | Sync status, per-entity sync metadata, unacknowledged corrections | SecureStore |
| `useReconciliationStore` | `features/notifications/reconciliation.store.ts` | Highest processed `roleChangeSeq` per (guild, wallet) | SecureStore |
| `useAccessHistoryStore` | `features/access/accessHistory.store.ts` | Recent access-check log (capped) | In-memory |
| `useBiometricStore` | `features/security/biometric.store.ts` | Biometric-required preference | SecureStore |
| `useIntegrityWarningStore` | `features/security/integrityWarning.store.ts` | Device-compromise warning banner state | In-memory |
| `useNetworkStore` | `features/network/connectivityService.ts` | Online/offline flag, fed by NetInfo | In-memory |

### Cross-feature writes

A feature module imports only its own store. Every state write that spans features is
declared in `src/lib/`, so the fan-out is readable, ordered, and awaitable in one place:

- **`src/lib/walletLifecycle.ts`** — `startWalletSession`, `endWalletSession`,
  `invalidateSessionForCompromise`. Wallet connect/disconnect spans the session, sync,
  and query-cache layers; `endWalletSession` drops wallet-scoped queries and sync state
  **before** ending the session, so a screen still mounted during teardown cannot
  refetch against a live token.
- **`src/lib/resetAppState.ts`** — full app reset across every store, the persisted
  query cache, and attestation storage.

Adding a cross-feature transition means adding it to one of these modules, not importing
another feature's store into a hook or component.

### Wallet providers

Three wallet paths are supported, all converging through the `WalletConnector` interface
into `useWalletStore`:

| Path | Provider | Connection kind | How it works |
|---|---|---|---|
| **Manual entry** | None | `manual` | User pastes an EVM address; `createManualConnector` wraps it |
| **WalletConnect** | WalletConnect v2 | `walletconnect` | WC modal → EIP-1193 → `createWalletConnectConnector` |
| **Embedded wallet** | Privy (`@privy-io/expo`) | `embedded` | Email OTP or Google OAuth → Privy provisions MPC wallet → `createEmbeddedConnector` wraps the address |

**Trust Model & Verification:** Connecting a wallet via WalletConnect or entering one manually populates the address, but does not inherently prove cryptographic ownership. The `isVerified` state in `useWalletStore` tracks whether the user has successfully signed a verification message (`personal_sign`). Manually entered wallets are permanently unverified. Connected wallets require an explicit signature before `isVerified` becomes true, enabling stronger trust guarantees.

**Key design principle:** Privy is only the provisioning layer. Once the embedded wallet
address enters `useWalletStore`, every downstream flow (memberships, guilds, access checks,
sync, attestations) sees a standard EVM address. No screen or hook needs to know the wallet
was provisioned by Privy.

The embedded path is feature-flagged via `EXPO_PUBLIC_PRIVY_APP_ID` and
`EXPO_PUBLIC_PRIVY_CLIENT_ID` environment variables. When both are set,
`isEmbeddedWalletEnabled` is `true` and the onboarding screen offers the social/email option.

See `docs/embedded-wallet-provider.md` for the provider evaluation, security model, and
custody trade-off documentation.

### Selectors

Subscribe with a selector, never by calling the store hook bare. `useWalletStore()`
returns a new state object on every `set()`, so it re-renders consumers even when no
value they read has changed:

```ts
// Do this — re-renders only when this slice changes
const walletAddress = useWalletStore((s) => s.walletAddress);

// Not this — re-renders on every store write
const { walletAddress } = useWalletStore();
```

Prefer one atomic selector per value. Reach for `useShallow` (from
`zustand/react/shallow`) only when a selector must return a **newly constructed** object
or array, which is the single case `Object.is` equality cannot handle. No selector in the
codebase currently needs it; wrapping atomic selectors that return primitives or stable
action references adds indirection with no effect on re-render counts.

<!-- GuildPass Mobile: Informational section content header block. -->

## Extension Points

Four places accept new integrations. Two are registries, two are plain interfaces,
and the difference is deliberate: **a registry is warranted where two or more real
implementations already exist; a single implementation gets an interface and a
documented seam.** A registry over one stub is indirection with nothing behind it.

### Credential issuers

`src/lib/credentials/` defines how a signed credential's issuer key is resolved and
whether it has been revoked. Two implementations ship: signed QR access payloads
(`features/access/guildIssuerKey.ts`) and EIP-712 role attestations
(`features/attestation/issuerKeyRegistry.ts`).

```ts
export interface CredentialIssuerRegistry {
  readonly credentialKind: CredentialKind;
  lookupIssuerKey(guildId, ref: IssuerKeyRef | null, now?): Promise<IssuerKeyLookup>;
  isRevoked(guildId, ref: IssuerKeyRef, now?): Promise<boolean | null>;
}
```

**Fail-closed is the contract.** Implementations never throw. An indeterminate
outcome is reported as `status: "unavailable"` or `null`, and callers must treat
that as a rejection — a verifier that cannot confirm a key's continued validity
must not accept a credential that key may have signed.

Only the interface and the staleness arithmetic (`registryFreshness.ts`) are
shared. The mechanisms behind them are not, and unifying them would be a security
behaviour change rather than a refactor:

| | QR access | EIP-712 attestation |
| --- | --- | --- |
| Registry source | Refreshes over the network on TTL expiry | Never fetches; pushed in by `cacheAttestationRevocationRegistry()` |
| Revoked by | Key id (`kid`) | Issuer address |
| Trust-window boundary | Inclusive (`age <= window`) | Inclusive in memory, **exclusive** when persisted |

`FreshnessPolicy.trustWindowBoundary` is required and has no default, so a new
caller has to state which boundary it means instead of inheriting one silently.

**Registration is for discovery only.** `registerBuiltInIssuers()` runs from
`app/_layout.tsx`, and `getCredentialIssuerRegistry()` exists for future consumers
that need to dispatch by credential kind. The live verification paths —
`getGuildIssuerPublicKey()` and `checkIssuerKeyRevoked()` — call their own
module-local registry objects directly and never go through the global map.
Routing them through it would make access gating depend on bootstrap ordering: a
credential checked before registration ran would throw instead of failing closed,
and deep links can reach a verification path before the root layout finishes
mounting. **Discovery may depend on bootstrap; gating may not.**

To add a credential kind: implement `CredentialIssuerRegistry`, export the instance
from its own feature, register it in `registerBuiltInIssuers()`, and add a case to
`tests/credentials/issuerRegistryContract.test.ts` — the conformance suite runs the
same assertions against every implementation.

### Wallet connectors

`features/wallet/walletConnectorRegistry.ts` records which connector types the build
ships. It replaced a hardcoded `Record<WalletConnectorType, boolean>` in which
`coinbase` and `metamask` sat at `false` — the one place that literally required
editing core to add an integration.

It stores **descriptors**, not factories, because construction arguments are
genuinely heterogeneous (`createManualConnector` takes an address,
`createWalletConnectConnector` takes an EIP-1193 provider); a `Map<type, factory>`
would erase those types to `unknown` for no caller's benefit.

Built-ins are seeded at module load, not at bootstrap, for the same reason the
credential gating paths avoid the global registry. The registry answers "does this
build ship an implementation?", not "is it configured right now" — runtime config
gating stays in `isEmbeddedWalletEnabled`. The module imports nothing but its own
types, deliberately: `walletConnector.service` re-exports from it, so anything that
module pulls in reaches every consumer, and importing `appConfig` dragged
Flow-typed `expo-constants` into suites that could not parse it.

Every connection path — manual, WalletConnect, and embedded — now goes through
`WalletConnector`. The embedded path used to write to the wallet store directly;
`createEmbeddedConnector(address)` wraps the already-provisioned address so
`useWallet` has one connect path instead of a special case.

To add a wallet: export a factory returning `WalletConnector` and call
`registerWalletConnector({ type, label, isAvailable })`.

### Verification sources

`features/access/accessDecisionPipeline.ts` takes `backendCheck`, `rpcResolver`, and
`attestationVerifier` as optional per-call thunks. **That injection is the seam —
there is deliberately no registry.**

A registry would not help. The decision policy is not generic over N sources:
backend is authoritative, RPC and attestation each corroborate it with their own
named confidence levels and disagreement branches. A registry would hand a list to
a hardcoded three-branch cascade, so adding a source would still mean editing
`AccessDecisionConfidence`, `getConfidenceLabel`, and the cascade itself. The
extensibility bottleneck is the confidence taxonomy, not the injection mechanism.

To add a source: extend `ResolveAccessDecisionParams` and the confidence taxonomy
together, since a new source needs its own corroboration and disagreement outcomes.

### Session adapters

`features/session/session.types.ts` defines `SessionAdapter` (`signIn` / `refresh` /
`signOut`), and `session.store.ts` exposes `setAdapter()`. One implementation ships:
`noopSessionAdapter`, which treats a connected wallet as authenticated.

**There is no adapter registry, and one is not wanted yet.** With a single stub
implementation it would be indirection over nothing, and a future SIWE or backend
adapter arrives through `setAdapter` either way. The seam already works —
`tests/session-and-connector.test.ts` swaps in three different adapters and asserts
the store behaves correctly for each.

To add an auth provider: implement `SessionAdapter` and call
`useSessionStore.getState().setAdapter(yourAdapter)` during bootstrap.

<!-- GuildPass Mobile: Informational section content header block. -->

## Feature Organization

The `src/features/` directory is organized by domain:

- `wallet/`: Logic for connecting and managing the user's wallet address.
- `guilds/`: API wrappers and hooks for guild metadata.
- `membership/`: Hooks for checking user-specific membership data.
- `access/`: Logic for the access check protocol.
- `network/`: NetInfo-backed connectivity service and network store.
- `offline/`: Hooks for network status and stale-cache indicators.
- `sync/`: Offline-first sync engine — reconciles cached entities against
  server state on reconnect with a server-authoritative conflict policy and
  visible correction notices (see `docs/sync-engine.md`).

Each feature typically contains:

- `*.api.ts`: SDK wrapper functions.
- `*.types.ts`: Domain-specific TypeScript interfaces.
- `use*.ts`: Custom hooks for UI components.

<!-- GuildPass Mobile: Documentation section layout header reference. -->

## UI & Styling

We use **NativeWind**, which allows us to use Tailwind CSS classes directly in React Native components. This ensures:

- Consistent design system across platforms.
- Faster development cycle.
- Highly readable component code.

<!-- GuildPass Mobile: Informational section content header block. -->

## Wallet Integration Path

Three connection paths ship today, all behind the `WalletConnector` interface and
recorded in the connector registry (see **Extension Points → Wallet connectors**):

1. **Manual address entry** — `createManualConnector`.
2. **WalletConnect** — `createWalletConnectConnector`, via
   `@walletconnect/modal-react-native`.
3. **Embedded wallets** — `createEmbeddedConnector`, wrapping the address the
   configured social/email provider (Privy) provisions at login.

Still unimplemented, and registrable without touching core:

- **Coinbase Wallet** and **MetaMask** — deliberately unregistered rather than
  listed as unavailable, so they report unsupported until a connector exists.
- **Expo-standard wallets** — deep-linking into wallet apps via `expo-linking`.
