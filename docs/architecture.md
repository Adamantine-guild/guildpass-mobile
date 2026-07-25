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

### Golden rule

Server entity data (guilds, roles, memberships) never goes into Zustand. Zustand holds
only client state that has no server equivalent. Store an entity `id` and resolve the
entity through React Query at render time rather than copying a snapshot into a store.

### Store ownership

Each store lives in the feature that owns it and is the only owner of its state.

| Store | Location | Owns | Persistence |
| ----- | -------- | ---- | ----------- |
| `useWalletStore` | `features/wallet/wallet.store.ts` | Connected address, connection status, connector kind | SecureStore |
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

## Future Wallet Integration Path

The current MVP uses a manual address entry. The architecture is designed to easily swap this with:

1. `WalletConnect`: Using `@web3modal/react-native`.
2. `Expo-standard wallets`: Using `expo-linking` for deep-linking into wallet apps.
3. `Embedded Wallets`: Integration with social-login based wallets for non-crypto-native users.
