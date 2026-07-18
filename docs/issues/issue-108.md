# Issue #108 — Build a Resilient Offline-First Sync Engine with Conflict Resolution

## Summary

This PR adds a sync engine that reconciles all locally-cached entities
against authoritative server state when connectivity returns. The conflict
policy is server-authoritative for role/membership data: on reconnect the
engine refetches every reconcilable cached entity, overwrites the cache with
the server value, records per-entity `lastSyncedAt`/content-version metadata,
and — when the divergence is meaningful (e.g. a cached "granted" role the
server has since revoked) — surfaces a visible correction notice instead of
silently overwriting. Offline-queued mutations are replayed before reads are
reconciled.

## Changes Made

### `src/features/sync/` (new module)

- **`sync.types.ts`** — domain types: entity descriptors, corrections
  (critical/info severity), per-entity sync metadata, run summaries.
- **`reconcile.ts`** — pure, side-effect-free reconciliation logic:
  `describeSyncableQuery` (query key → entity descriptor),
  `computeEntityVersion` (stable content hash, since the SDK exposes no
  versions/ETags), and `diffEntity` (per-entity-kind conflict detection:
  membership revoked/restored, roles removed/added, guild deactivated,
  access policy changed).
- **`sync.store.ts`** — Zustand store persisted to AsyncStorage holding sync
  status, per-entity `lastSyncedAt`/`version` metadata, and unacknowledged
  corrections (deduplicated by deterministic id, capped at 20, survive app
  restarts).
- **`syncEngine.ts`** — the reconciliation pass. Walks the React Query cache,
  refetches each entity, applies the server-authoritative overwrite via
  `setQueryData` (which also refreshes `dataUpdatedAt` for the existing
  stale-data banners), and records corrections/metadata. Fully
  dependency-injected (query client, fetchers, store, connectivity probe,
  clock); shares a single in-flight pass between concurrent callers;
  isolates per-entity fetch failures.
- **`syncFetchers.ts`** — default per-entity fetchers backed by the GuildPass
  SDK singleton.
- **`syncManager.ts`** — reconnect wiring: subscribes to the network store
  (fed by NetInfo via the existing `connectivityService`), debounces the
  offline → online transition, replays paused mutations
  (`resumePausedMutations`), then runs the engine. `triggerSync()` allows
  manual runs.
- **`useSyncStatus.ts`** — `useSyncStatus()` / `useSyncCorrections()` hooks.

### `src/components/` (new)

- **`SyncCorrectionNotice.tsx`** — accessible alert banner listing
  corrections (critical first, error styling when any correction is
  critical) with a dismiss action; follows the `StaleDataBanner` pattern.
- **`SyncCorrectionOverlay.tsx`** — app-level wrapper rendered from the root
  layout so corrections surface on whatever screen is active.

### `app/_layout.tsx` (updated)

- Calls `initSyncManager()` alongside `initConnectivityService()`, renders
  `<SyncCorrectionOverlay />` above the navigation stack, and triggers an
  initial reconciliation from `PersistQueryClientProvider`'s `onSuccess`
  (i.e. only after the persisted cache is fully restored — covering the
  device that reopens online with a stale persisted cache and avoiding any
  race with the async restore).

### `src/lib/resetAppState.ts`, `src/features/wallet/useWallet.ts` (updated)

- Full app reset and wallet disconnect now also clear sync metadata and
  pending corrections, so a newly connected wallet never sees the previous
  wallet's correction notices.

### `src/lib/walletScopedCache.ts` (updated)

- Exports `walletScopedQueryRoots` so the sync module shares the canonical
  definition of which query keys carry a wallet-address segment.

### `tests/sync/` (new, 49 tests)

- `reconcile.test.ts`, `syncEngine.test.ts`, `sync.store.test.ts`,
  `syncManager.test.ts`, `syncCorrectionNotice.test.tsx` — see
  `docs/sync-engine.md` for coverage details.

### `docs/` (new/updated)

- **`docs/sync-engine.md`** — architecture, conflict policy, correction
  lifecycle, failure semantics.
- **`docs/architecture.md`** — added the sync feature to the feature map.

## Acceptance Criteria Met

- [x] Simulated "cached role granted, server now says revoked" scenario
      results in the cache updating **and** a visible correction notice —
      not a silent overwrite (covered both at the engine level in
      `syncEngine.test.ts` and end-to-end through the reconnect trigger in
      `syncManager.test.ts`; the notice UI is covered in
      `syncCorrectionNotice.test.tsx`).
- [x] Sync engine has isolated unit tests independent of network and UI
      (all collaborators injected; conflict detection is pure functions).
- [x] Reconciliation pass triggered on reconnect via NetInfo (through the
      existing `connectivityService` → network store, debounced).
- [x] Per-entity `lastSyncedAt`/version metadata tracked in a persisted
      sync store.
- [x] Server-authoritative conflict-resolution policy for role/membership
      data.
- [x] Architecture documented in `docs/sync-engine.md`.

## Notes

- The SDK returns untyped payloads with no version/ETag, so entity versions
  are content hashes (`computeEntityVersion`); swapping in real server
  versions later only touches that function.
- The reconciled namespaces are **derived from** the offline-cache allowlist
  (`PERSISTABLE_QUERY_KEY_ROOTS`) minus `access-check`, which is a mutation
  namespace; queued access-check mutations are handled by the
  replay-before-reconcile step instead. Adding a new persisted namespace
  therefore fails compilation until the sync module handles it.
- A `null` server payload is treated as an authoritative "gone" (membership
  revoked / all roles removed), not as malformed data, so the primary
  revocation shapes cannot slip through without a correction notice.
- Malformed/unexpected payload shapes skip conflict *detection* but never
  the server-authoritative overwrite, so corrupt local data cannot pin the
  cache to a stale state.
- Entity fetches on reconnect run through a small concurrency pool, and
  per-entity metadata is persisted in one batched store write per pass.

Closes #108
