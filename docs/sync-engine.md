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
   offline (e.g. access-check submissions) are replayed *before* reads are
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

| Module | Responsibility |
| --- | --- |
| `sync.types.ts` | Domain types: descriptors, corrections, per-entity metadata, run summaries. |
| `reconcile.ts` | Pure logic: parse query keys into entity descriptors, content-hash versioning, per-entity-kind conflict detection. No side effects. |
| `sync.store.ts` | Zustand store persisted to AsyncStorage: sync status, per-entity `lastSyncedAt`/`version` metadata, unacknowledged corrections (capped, deduplicated by deterministic id). |
| `syncEngine.ts` | The reconciliation pass. Walks the React Query cache, refetches each reconcilable entity, applies the server-authoritative overwrite, records metadata and corrections. All dependencies injected. |
| `syncFetchers.ts` | Default per-entity fetchers backed by the GuildPass SDK singleton. |
| `syncPriority.ts` | Scheduling policy: priority tier per entity kind, most-stale-first ordering within a tier. |
| `retryPolicy.ts` | Configurable exponential backoff with jitter, used for both per-entity and pass-level retries. |
| `syncCoordinator.ts` | Single owner of *when* a pass runs: coalescing, rate limiting, retry scheduling, and the reason the current pass is running. |
| `syncTriggers.ts` | Trigger adapters (reconnect, app-foreground). Each observes one platform signal and calls the coordinator; no trigger carries scheduling policy of its own. |
| `syncManager.ts` | App wiring: builds the engine and coordinator, registers the triggers, and exposes `initSyncManager` / `triggerSync` / `getSyncCoordinator`. Initialized once in `app/_layout.tsx`. |
| `useSyncStatus.ts` | UI hooks: `useSyncStatus()` and `useSyncCorrections()`. |

UI lives in `src/components/SyncCorrectionNotice.tsx` (presentational banner,
follows the `StaleDataBanner` conventions),
`src/components/SyncCorrectionOverlay.tsx` (app-level wrapper rendered from
the root layout so corrections surface on whatever screen is active), and
`src/components/SyncStatusBanner.tsx` (in-progress and failed sync states,
with a retry action).

### Sync triggers

All triggers go through `syncCoordinator.requestSync(reason)`. The coordinator
— not the trigger — decides whether a pass actually runs, so adding a trigger
cannot introduce a second scheduling regime.

1. **Reconnect** — the offline → online transition observed through the
   network store, debounced (`SYNC_RECONNECT_DEBOUNCE_MS`).
2. **App foreground** — `AppState` returning to `active`. Push delivery is
   best-effort, so a device that slept through a role change learns about it
   on return.
3. **Startup, after cache restore** — `PersistQueryClientProvider`'s
   `onSuccess` fires once the persisted query cache is fully restored, and
   the layout triggers a pass then. This covers the device that went offline,
   was closed, and reopens *online*: no reconnect event ever fires, but the
   restored cache may hold revoked grants. It also guarantees reconciliation
   never races the async cache restore (a reconnect-triggered pass before
   restore would walk a still-empty cache).
4. **Manual** — `triggerSync()`, and the status banner's retry action, for
   pull-to-refresh-style integration.
5. **Retry** — scheduled by the coordinator after a pass that ended with
   errors.

**Coalescing and rate limiting.** Concurrent requests share the in-flight pass
rather than queueing a second one. Background triggers are additionally
rate-limited to one pass per `MIN_SYNC_INTERVAL_MS` (30s), because a reconnect
and a foreground event routinely fire on the same "user came back with signal"
moment. `manual` and `retry` are exempt: a user who taps retry must get a pass
rather than silence.

### Scheduling & priority

The concurrency cap (`MAX_CONCURRENT_FETCHES = 5`) keeps the fan-out sane on a
just-recovered radio, but which five go first is a security property, not a
detail. `membership` and `user-roles` are what the access-gating paths read,
so they form tier 1 and are dispatched before the tier-2 display entities
(`guild`, `guild-config`, `guild-roles`). Within a tier, entities are ordered
most-stale-first using the `lastSyncedAt` already persisted in `sync.store`;
entities never synced sort first, since they have no confirmed value at all.

## Reconciled entities

Reconciliation covers the five entity kinds below, enumerated explicitly in
`SyncEntityKind` (`sync.types.ts`) and `RECONCILED_QUERY_KEY_ROOTS`
(`reconcile.ts`). `SyncEntityFetchers` is a `Record` over that union, so a
kind without a fetcher is a compile error.

**Being persisted and being reconcilable are different properties.** This list
was originally derived from `PERSISTABLE_QUERY_KEY_ROOTS`, which was a defect:
that allowlist also contains `memberships` (a client-side aggregate, not a
server entity) and `profile`/`user-profile` (no query key in use), for which
no fetcher exists or can exist. Because the engine dispatches via
`fetchers[descriptor.kind]`, a cached `["memberships", wallet]` entry resolved
to `undefined` and threw, failing every pass once the guilds or profile screen
had populated the cache. The persistence allowlist is unchanged — those roots
are still cached and still persisted, they are simply not reconciled:

| Query key | Scope | Critical corrections | Info corrections |
| --- | --- | --- | --- |
| `["membership", wallet, guildId]` | wallet | `membership_revoked` | `membership_restored` |
| `["user-roles", wallet, guildId]` | wallet | `roles_removed` | `roles_added` |
| `["guild", guildId]` | guild | `guild_deactivated` | — |
| `["guild-config", guildId]` | guild | — | `access_policy_changed` |
| `["guild-roles", guildId]` | guild | — (silent refresh) | — |

**Severity semantics:** `critical` means local state overstated the user's
access (they may have acted on a "granted" that is now false); `info` means
state changed without inflating permissions. The overlay uses the error
treatment when any correction is critical.

Every reconciled entity always adopts the server value, whether or not a
correction is emitted — malformed/unrecognized payload shapes simply skip
conflict *detection*, never the overwrite. A **`null` server payload is not
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
- **Transient per-entity failure** → retried in place with exponential backoff
  and jitter (`retryPolicy.ts`; 3 attempts, 1s base, ×2, ±20%, 30s cap, all
  configurable via `SyncEngineDeps.retryConfig`).
- **Per-entity fetch failure that exhausts retries** → that entity keeps its
  last cached value and is reported in `SyncRunSummary.errors`; all other
  entities still reconcile and **keep their confirmed metadata and
  corrections**, so a flaky pass still makes forward progress. The store
  status becomes `error` with a summary message.
- **Pass ends with errors** → the coordinator schedules a retry on the same
  backoff curve rather than waiting for the next reconnect, which could
  otherwise be hours away (or never, on a device that stayed online
  throughout).
- **Connectivity lost mid-pass** → `interrupted_offline`. Retries are
  cancelled rather than burned against a dead link, entities already
  reconciled are committed, and the rest are simply left for the next pass —
  they are *not* recorded as errors, because they were never disproven. No
  timer is scheduled: the reconnect trigger is a better wake-up than a clock.
- **Empty (`undefined`) server response** → treated as a per-entity error;
  the cache is never wiped by a missing payload.
- **Concurrent triggers** (reconnect bursts, or a foreground event landing on
  a reconnect) → callers share one in-flight pass; NetInfo flapping is
  additionally debounced in the reconnect trigger, and background triggers are
  rate-limited by the coordinator.
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

## Status surfacing

Sync state is user-visible through `SyncStatusBanner`, the first consumer of
`useSyncStatus()`. It renders **nothing** while `status === "idle"` — a
permanent "last synced" chip is noise on a screen the user is trying to read —
and appears only for:

- **syncing** — spinner plus "Checking your memberships and roles".
- **error** — the engine's own failure message, the last successful sync time,
  and a **Retry** action that calls `requestSync("manual")` (rate-limit exempt).

This is distinct from the correction notice, which reports *what changed*.
The banner reports *whether the check itself is working*. Together with the
existing offline and stale-data banners, a user can always tell which of
"offline", "stale", "syncing", "sync failed" and "corrected" applies.

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
- `syncCoordinator.integration.test.ts` — behaviour **under intermittent
  connectivity**, driving the real engine, coordinator, store and QueryClient
  together with only the network, clock and connectivity signal faked:
  reconnect-burst coalescing, partial commit when the link dies mid-pass,
  the backoff curve, retries suppressed while offline, tier-1-before-tier-2
  dispatch under the concurrency cap, one shared pass across reconnect and
  foreground triggers, rate limiting with the `manual` exemption, observable
  status transitions, and a regression guard for the `memberships` crash.
- `syncStatusBanner.test.tsx` — idle renders nothing; syncing and failed
  states render; retry reaches the coordinator.
- `syncCorrectionNotice.test.tsx` — the visible notice renders correction
  messages, alerts accessibly, and dismisses.

Run with `npx vitest run tests/sync`.
