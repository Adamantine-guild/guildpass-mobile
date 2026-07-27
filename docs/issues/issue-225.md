# Issue #225 — Centralized Synchronization Engine

## Summary

Most of what this issue asks for shipped with #108: `src/features/sync/` is
already a dependency-injected engine that walks the React Query cache,
refetches server-authoritatively, detects conflicts through pure functions in
`reconcile.ts`, caps concurrency, and shares a single in-flight pass between
callers. Offline support is likewise complete (encrypted AES-GCM-256 query
persistence, `PersistQueryClientProvider`, `networkMode: "offlineFirst"`,
7-day GC).

This change closes the five gaps that remained, and fixes a latent crash found
while surveying them.

1. **Two mutually unaware background-sync systems.** `features/sync/syncManager`
   (reconnect-driven, RQ-cache-based) and
   `features/notifications/useBackgroundSync` (AppState + OS background fetch,
   reconciliation-store-based) shared no scheduler, rate limiter or status.
   Scheduling now belongs to one `syncCoordinator`; the second system is
   deleted.
2. **No retry or backoff.** The only retry configured anywhere was React
   Query's global `retry: 2`, which covers component queries, not the sync
   pass. `syncEngine.run()` recorded failures via `failSync()` and stopped.
3. **No priority or scheduling policy.** FIFO over whatever the cache iterator
   yielded, under a 5-slot pool.
4. **Sync status was not user-visible.** `useSyncStatus()` had zero consumers.
5. **No integration coverage under intermittent connectivity.**

**Latent crash fixed.** `SyncEntityKind` was derived from
`PersistableQueryKeyRoot`, which resolves to eight roots, while
`defaultSyncFetchers` defined five. The engine dispatches via
`fetchers[descriptor.kind]`, so a cached `["memberships", wallet]` entry —
written by `app/guilds.tsx` and `app/profile.tsx` — resolved to `undefined`
and threw a `TypeError`, failing **every** reconciliation pass once either
screen had been visited. `tsc` reported this as a `TS2739` on
`syncFetchers.ts`; the existing tests missed it because they inject fakes
covering all eight keys.

## Changes Made

### `src/features/sync/sync.types.ts` (updated)

- `SyncEntityKind` is now an explicit five-member union instead of
  `Exclude<PersistableQueryKeyRoot, "access-check">`. Being persisted and being
  reconcilable are different properties; conflating them caused the crash
  above. `PERSISTABLE_QUERY_ROOTS` is deliberately **unchanged**, so
  `memberships`, `profile` and `user-profile` are still cached and still
  persisted — they are simply not reconciled.
- `SyncRunSummary.status` gains `interrupted_offline`, distinct from
  `completed_with_errors`: the server being unreachable is not the server
  rejecting a request.

### `src/features/sync/reconcile.ts` (updated)

- `RECONCILED_QUERY_KEY_ROOTS` enumerated rather than filtered from the
  persistence allowlist.

### `src/features/sync/retryPolicy.ts` (new)

- Configurable exponential backoff with jitter (3 attempts, 1s base, ×2, ±20%,
  30s cap). `runWithRetry` throws `RetryAborted` when connectivity drops, so
  callers can distinguish "the network went away" from "the server failed us".
- Retries are cancelled rather than burned while offline — otherwise the
  budget is spent before connectivity actually returns.
- Feature-scoped, not `src/lib/`. Ad-hoc backoff also exists in
  `keyManager.ts:137-164` and `roleEligibilityResolver.ts:182`, but both sit
  inside security-sensitive trust windows where changing the timing curve is a
  behaviour change, not a refactor. Until something outside sync adopts this,
  it is not a cross-feature concern (per #224's `src/lib/` rule).

### `src/features/sync/syncPriority.ts` (new)

- Two tiers: `membership` and `user-roles` (tier 1, access-gating) dispatch
  before `guild`, `guild-config`, `guild-roles` (tier 2, display). Ordering is
  a security property — with a 5-slot pool on a slow link, a guild banner
  could previously occupy a slot while a revoked membership waited.
- Within a tier, most-stale-first using the `lastSyncedAt` already persisted in
  `sync.store`. Never-synced entities sort first.

### `src/features/sync/syncCoordinator.ts` (new)

- Single owner of *when* a pass runs: coalescing (concurrent callers share the
  in-flight pass), rate limiting (`MIN_SYNC_INTERVAL_MS` = 30s for background
  triggers, exempt for `manual` and `retry`), pass-level retry scheduling, and
  the reason the current pass is running.

### `src/features/sync/syncTriggers.ts` (new)

- `registerReconnectTrigger` (offline → online, debounced) and
  `registerForegroundTrigger` (`AppState` → `active`). Each observes one signal
  and calls the coordinator; no trigger carries policy of its own.
- `react-native` is resolved lazily and tolerantly. A static `AppState` import
  pulls react-native's Flow-typed sources into the module graph, which the
  vitest node transform cannot parse — it makes every test touching
  `syncManager` fail to collect. Deferring keeps the module importable; on
  device the code path is identical.

### `src/features/sync/syncEngine.ts` (updated)

- Descriptors run through `prioritizeDescriptors` instead of raw cache order.
- Per-entity fetches run through `runWithRetry`.
- Partial success: entities that reconciled keep their metadata and
  corrections even when siblings failed. A `RetryAborted` is recorded as an
  interruption, not an entity error.

### `src/features/sync/syncManager.ts` (updated)

- Reduced to composition — build engine, build coordinator, register triggers.
  The public surface `app/_layout.tsx` uses (`initSyncManager`, `triggerSync`)
  is unchanged; `getSyncCoordinator()` is added for the banner's retry action.

### `src/components/SyncStatusBanner.tsx` (new)

- First consumer of `useSyncStatus()`. Renders nothing when idle; shows a
  spinner while syncing; shows the engine's failure message, last successful
  sync time and a **Retry** action on error.

### `src/features/notifications/useBackgroundSync.ts` (deleted)

Deleted rather than wired in, because it was a second *engine*, not a second
trigger:

- Zero consumers. `registerBackgroundSyncTask()` was never called, so it had
  never run in production.
- It reconciled against `reconciliation.store` with `roleChangeSeq` versioning
  and direct `guildPassClient` calls, bypassing the engine's diff/correction
  pipeline entirely. Wiring it in would have meant maintaining two divergent
  definitions of "reconciled" — the exact problem this issue exists to end.
- It dynamically imported `expo-task-manager` and `expo-background-fetch`,
  neither declared in `package.json` (9 type errors, 4 lint errors).
- Its genuinely useful part — the foreground trigger — is recovered in
  `syncTriggers.ts`. Its OS background-fetch part is **not** reinstated: that
  needs two native modules in a managed Expo 50 app plus a config plugin and
  an EAS rebuild, for a capability the OS throttles aggressively. That is its
  own issue.
- `useReconciliation.ts` and `reconciliation.store.ts` are **kept** —
  `src/lib/resetAppState.ts:16,22` depends on the store.

### `src/features/notifications/index.ts` (updated)

- Dropped the three `useBackgroundSync` exports; the header comment now points
  foreground/background catch-up at the sync coordinator.

### `app/_layout.tsx` (updated)

- Mounts `<SyncStatusBanner />` beside the existing `<SyncCorrectionOverlay />`.

### `tests/sync/` (new/updated, 49 → 62 tests)

- `syncCoordinator.integration.test.ts` (new, 9 tests) — see below.
- `syncStatusBanner.test.tsx` (new, 4 tests).
- `syncEngine.test.ts` — injects a no-op `sleep` so the new retry path does not
  put the existing assertions on the real clock (16ms → 2.7s → 18ms).

### `docs/sync-engine.md` (updated)

- Rewrote *Sync triggers* and *Failure semantics*; added *Scheduling &
  priority* and *Status surfacing*; corrected *Reconciled entities* to explain
  why the list is no longer derived from the persistence allowlist. Sections
  that remained accurate (*Design goals*, *Architecture*, *Per-entity sync
  metadata*, *Correction lifecycle*) are untouched.

## Acceptance Criteria Met

- [x] A single centralized scheduler owns background sync; the competing
      system is removed rather than left dormant.
- [x] Configurable, consistent retry with backoff, applied per-entity and
      per-pass, cancelled rather than burned while offline
      (`retryPolicy.ts`; covered in `syncCoordinator.integration.test.ts`).
- [x] Explicit priority and scheduling policy replacing FIFO
      (`syncPriority.ts`).
- [x] Users can determine sync status — `SyncStatusBanner` surfaces syncing
      and failed states with a retry action.
- [x] Integration tests verifying sync behaviour under intermittent
      connectivity (`syncCoordinator.integration.test.ts`).

## Notes

### Not done, and why

- **Not stacked on #226.** Checked before starting: #226's registries cover
  credential issuer keys, revocation freshness and wallet connectors. The sync
  engine schedules over five SDK calls, none of which #226 touches. The one
  candidate — `guildIssuerKey.ts`'s 15-minute key-registry TTL — is lazy and
  pull-based, evaluated at verification time inside the access-check path, so
  there is no schedule for a coordinator to own. #226 also has both
  access-gating paths deliberately call their module-local registries so a
  credential checked before bootstrap fails closed; routing that through a
  coordinator would be a security regression.
- **OS-level background fetch** — needs undeclared native dependencies, a
  config plugin and a native rebuild. Separate issue.
- **Backoff in `keyManager.ts` / `roleEligibilityResolver.ts` not unified** —
  security-sensitive timing, as above.
- **Pre-existing baseline failures held flat, not fixed**: the missing
  `@guildpass/sdk` `dist/` build (13 test files fail to collect), the
  `src/database/` type errors, and the `tests/database/` `MockDb` failures.
  All unrelated to sync; see below for the database finding.

### Finding: `src/database/` is load-bearing and cannot run

Surfaced while establishing the baseline. **Not acted on** — removing a layer
the maintainer documents as live, and changing what two screens display, is a
maintainer decision, not a sync-engine change. Recorded here so the decision
can be made deliberately:

- **It has a caller.** `src/features/membership/useMembership.ts:47-48`
  dynamically imports `database/connection` and `database/dal` inside
  `useMembershipsQuery`, which backs **`app/guilds.tsx:22`** and
  **`app/profile.tsx:120`**.
- **It cannot execute.** `src/database/connection.ts:25` calls
  `SQLite.openDatabase()` and types against `WebSQLDatabase` / `SQLResultSet` —
  the WebSQL API, removed in the installed `expo-sqlite@57`. This is 119 of
  the 165 `src/` type errors plus 1 lint error.
- **Nothing writes to it.** No DAL write call (`upsert*`, `bulkInsert*`, …)
  exists anywhere outside `src/database/`. Even if it opened,
  `getMembershipsByWallet` would return `[]`.
- **The docs claim otherwise.** `MIGRATION_STATE.md` documents SQLite as a
  live layer with DAL-backed offline reads. That section is inaccurate. It is
  **not** corrected here: correcting it belongs with whatever decision is
  made, not ahead of it.
- **There is no drop-in replacement.** The SDK surface (mirrored in
  `tests/fixtures/sdk.mock.ts`) exposes exactly the five methods
  `syncFetchers.ts` uses; there is no list-memberships-by-wallet call. SQLite
  appears to have been the only possible source.

**Recommendation:** treat this as its own issue with two parts — (a) file the
missing SDK memberships-by-wallet endpoint, and (b) once it exists, delete
`src/database/` and point `useMembershipsQuery` at it. Until (a) lands,
`app/guilds.tsx` and `app/profile.tsx` cannot show a real membership list by
any route. "Document as dormant and leave it" is the one option that does not
fit the evidence: the layer is not inert, it is load-bearing and broken.
