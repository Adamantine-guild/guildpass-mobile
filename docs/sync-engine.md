# Offline-First Sync Engine

GuildPass Mobile caches protocol data (memberships, roles, guilds, access
results) so the app stays usable offline. Caching alone, however, cannot
handle **divergence**: while a device is offline, the server may revoke a
role or membership that the device is still displaying as "granted". The sync
engine closes that gap by reconciling every cached entity against
authoritative server state when connectivity returns — and by telling the
user when their cached state was corrected, instead of silently overwriting
it.

## Design goals

1. **Server-authoritative conflict policy.** For role/membership/guild data
   the server value always wins. The device never "merges" its stale view
   into server state.
2. **No silent corrections.** If reconciliation finds a meaningful divergence
   (revoked membership, removed roles, deactivated guild, changed access
   policy), the user sees a visible correction notice.
3. **Local mutations replay first.** Mutations React Query queued while
   offline (e.g. access-check submissions) are replayed _before_ reads are
   reconciled, so local writes reach the server before its state is treated
   as final.
4. **Testable in isolation.** The engine takes every collaborator (query
   client, fetchers, store, connectivity probe, clock) as an injected
   dependency; conflict detection is pure functions.

## Architecture

```
                     NetInfo
                        │
        connectivityService (existing)
                        │  useNetworkStore (isOnline)
                        ▼
   ┌──────────── syncManager ─────────────┐
   │  offline → online transition,        │
   │  debounced (SYNC_RECONNECT_DEBOUNCE) │
   │  1. queryClient.resumePausedMutations│
   │  2. engine.runReconciliation()       │
   └───────────────┬───────────────────---┘
                   ▼
   ┌──────────── syncEngine ──────────────┐
   │ for each reconcilable cached query:  │
   │   fresh = fetchers[kind](descriptor) │      ┌─ reconcile.ts (pure) ─┐
   │   corrections = diffEntity(...)  ────┼─────▶│ describeSyncableQuery │
   │   queryClient.setQueryData(fresh)    │      │ diffEntity            │
   │   store.recordEntityMeta(...)        │      │ computeEntityVersion  │
   └───────────────┬───────────────────---┘      └───────────────────────┘
                   ▼
   ┌──────────── sync.store ──────────────┐
   │ status / lastSyncedAt metadata /     │
   │ unacknowledged corrections           │
   │ (persisted to AsyncStorage)          │
   └───────────────┬──────────────────────┘
                   ▼
        SyncCorrectionOverlay / SyncCorrectionNotice
        (banner rendered app-wide from app/_layout.tsx)
```

### Modules (`src/features/sync/`)

| Module             | Responsibility                                                                                                                                                                                                                                    |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sync.types.ts`    | Domain types: descriptors, corrections, per-entity metadata, run summaries.                                                                                                                                                                       |
| `reconcile.ts`     | Pure logic: parse query keys into entity descriptors, content-hash versioning, per-entity-kind conflict detection. No side effects.                                                                                                               |
| `sync.store.ts`    | Zustand store persisted to AsyncStorage: sync status, per-entity `lastSyncedAt`/`version` metadata, unacknowledged corrections (capped, deduplicated by deterministic id).                                                                        |
| `syncEngine.ts`    | The reconciliation pass. Walks the React Query cache, refetches each reconcilable entity, applies the server-authoritative overwrite, records metadata and corrections. All dependencies injected.                                                |
| `syncFetchers.ts`  | Default per-entity fetchers backed by the GuildPass SDK singleton.                                                                                                                                                                                |
| `syncManager.ts`   | App wiring: watches the network store for offline → online transitions, debounces NetInfo flapping, waits for the sync store's persisted state to hydrate, replays paused mutations, then runs the engine. Initialized once in `app/_layout.tsx`. |
| `useSyncStatus.ts` | UI hooks: `useSyncStatus()` and `useSyncCorrections()`.                                                                                                                                                                                           |

UI lives in `src/components/SyncCorrectionNotice.tsx` (presentational banner,
follows the `StaleDataBanner` conventions) and
`src/components/SyncCorrectionOverlay.tsx` (app-level wrapper rendered from
the root layout so corrections surface on whatever screen is active).

### Sync triggers

1. **Reconnect** — the offline → online transition observed through the
   network store, debounced (`SYNC_RECONNECT_DEBOUNCE_MS`).
2. **Startup, after cache restore** — `PersistQueryClientProvider`'s
   `onSuccess` fires once the persisted query cache is fully restored, and
   the layout triggers a pass then. This covers the device that went offline,
   was closed, and reopens _online_: no reconnect event ever fires, but the
   restored cache may hold revoked grants. It also guarantees reconciliation
   never races the async cache restore (a reconnect-triggered pass before
   restore would walk a still-empty cache).
3. **Manual** — `triggerSync()` for pull-to-refresh-style integration.

## Reconciled entities

Reconciliation covers the same persistable query namespaces as the offline
cache, minus `access-check` (a mutation namespace, not a cached server
entity). The list is **derived from** `PERSISTABLE_QUERY_KEY_ROOTS` in
`src/lib/offlineCache.ts` (and the wallet-scoped set is shared with
`src/lib/walletScopedCache.ts`), so adding a new persisted namespace forces
the sync module to handle it at compile time instead of silently skipping it:

| Query key                         | Scope  | Critical corrections | Info corrections        |
| --------------------------------- | ------ | -------------------- | ----------------------- |
| `["membership", wallet, guildId]` | wallet | `membership_revoked` | `membership_restored`   |
| `["user-roles", wallet, guildId]` | wallet | `roles_removed`      | `roles_added`           |
| `["guild", guildId]`              | guild  | `guild_deactivated`  | —                       |
| `["guild-config", guildId]`       | guild  | —                    | `access_policy_changed` |
| `["guild-roles", guildId]`        | guild  | — (silent refresh)   | —                       |

**Severity semantics:** `critical` means local state overstated the user's
access (they may have acted on a "granted" that is now false); `info` means
state changed without inflating permissions. The overlay uses the error
treatment when any correction is critical.

Every reconciled entity always adopts the server value, whether or not a
correction is emitted — malformed/unrecognized payload shapes simply skip
conflict _detection_, never the overwrite. A **`null` server payload is not
"malformed"**: for memberships it means the membership no longer exists
(revoked if the cache said active), and for user roles it means no roles
remain (roles_removed if any were cached) — the primary revocation shapes
must never slip through unannounced.

## Per-entity sync metadata

The SDK exposes no server-side versions or ETags, so the engine derives a
**content version**: an FNV-1a hash over a key-order-independent JSON
serialization (`computeEntityVersion`). After each pass the store holds, per
serialized query key:

```ts
{ lastSyncedAt: number /* epoch ms */, version: string /* content hash */ }
```

`lastSyncedAt` complements React Query's `dataUpdatedAt` (which the engine
also refreshes via `setQueryData`, keeping the existing stale-data banners
truthful). If the SDK later exposes real versions, only
`computeEntityVersion` needs to change.

## Correction lifecycle

1. `diffEntity` produces corrections with a **deterministic id**
   (`type:kind:guildId:wallet`), so re-detecting the same divergence on a
   later pass replaces the earlier notice instead of stacking duplicates.
2. `sync.store` keeps unacknowledged corrections (newest first, capped at
   `MAX_TRACKED_CORRECTIONS`, with informational notices evicted before
   critical ones) and persists them — a user who reopens the app still sees
   that their state was corrected.
3. `SyncCorrectionOverlay` renders them app-wide; dismissing acknowledges all.
4. Wallet disconnect (`useWallet.disconnect`) and `resetAppState()` clear
   sync metadata and corrections along with the rest of the wallet-scoped
   cache — a newly connected wallet never sees the previous wallet's notices.

## Failure semantics

- **Offline at run time** → the pass is skipped entirely (`skipped_offline`).
- **Per-entity fetch failure** → that entity keeps its last cached value and
  is reported in `SyncRunSummary.errors`; all other entities still reconcile.
  The store status becomes `error` with a summary message.
- **Empty (`undefined`) server response** → treated as a per-entity error;
  the cache is never wiped by a missing payload.
- **Concurrent triggers** (reconnect bursts) → callers share one in-flight
  pass; NetInfo flapping is additionally debounced in the manager.
- **Cache cleared mid-pass** (wallet disconnect / reset while a fetch is in
  flight) → the entity is skipped rather than resurrected into the cleared
  cache.
- **Sync store not yet hydrated** → the manager waits for (or re-runs)
  persisted-state hydration before syncing, so hydration completing later
  cannot clobber freshly recorded corrections; a failed storage read does
  not block sync.
- **Fan-out** → entity fetches run through a small concurrency pool
  (`MAX_CONCURRENT_FETCHES`) instead of hitting a just-recovered radio with
  every cached entity at once, and per-entity metadata is written to the
  store in a single batched update per pass.
- **Paused-mutation replay failure** → the failed mutations stay in React
  Query's mutation cache; reconciliation still runs so reads get corrected.

## Testing

`tests/sync/` exercises the engine with no network, NetInfo, or UI:

- `reconcile.test.ts` — pure conflict detection and versioning.
- `syncEngine.test.ts` — the acceptance scenario (cached "granted", server
  says "revoked" → cache corrected **and** correction surfaced), offline
  skip, partial-failure isolation, metadata recording, in-flight dedupe.
- `sync.store.test.ts` — correction lifecycle, dedupe/cap, status transitions.
- `syncManager.test.ts` — debounced reconnect trigger, replay-before-
  reconcile ordering, plus an end-to-end run through manager → engine →
  query cache → store with a mocked SDK.
- `syncCorrectionNotice.test.tsx` — the visible notice renders correction
  messages, alerts accessibly, and dismisses.

Run with `npx vitest run tests/sync`.
