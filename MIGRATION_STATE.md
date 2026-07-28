# State Architecture & Migration Guide

## Architecture Overview

The app uses a **three-layer state architecture** to avoid denormalization and state drift:

```
┌─────────────────────────────────────────────────┐
│                  React Query                     │
│         (Server state — in-memory cache)         │
│  guilds / roles / memberships / attestations     │
├─────────────────────────────────────────────────┤
│                   SQLite (DAL)                   │
│    (Normalized offline persistence — tables)     │
│  guilds | roles | memberships | user_roles       │
├─────────────────────────────────────────────────┤
│                 Zustand Stores                   │
│     (Client-only UI/device state — no entities)  │
│  wallet | session | sync | biometric | history   │
└─────────────────────────────────────────────────┘
```

**Golden rule:** Server entity data (guilds, roles, memberships) never goes into Zustand. Zustand holds only client-only state like wallet connection status, session tokens, sync progress, and access check history.

---

## Layer Responsibilities

### 1. React Query — Server State Cache

- **Owns:** All entity data fetched from the API (guilds, roles, memberships, attestations)
- **Persistence:** Encrypted AsyncStorage blob via `@tanstack/react-query-persist-client`
- **Offline reads:** `resolveFromDal()` in `queryAdapter.ts` serves data from SQLite
- **Staleness:** 5-minute staleTime; foreground refetch on app resume
- **Sync:** On reconnect, the Sync Engine refetches and overwrites cache with server-authoritative data

#### Encrypted cache key rotation

React Query persistence is encrypted through `createEncryptedAsyncStoragePersister`.
`KeyManager.initialize()` only ensures a key exists and reports stale keys; it does
not overwrite an existing key by itself. Rotation is coordinated by the encrypted
persister because that layer owns the serialized cache envelope.

When a key is older than the rotation interval, the persister decrypts the current
`gp1:` envelope with the old key, re-encrypts the same `PersistedClient` under the
new key, writes the rotated envelope back to storage, and only then lets
`KeyManager.rotateKey()` commit the new key. If re-encryption fails or the cache is
unreadable, rotation is deferred and the old key remains active so normal cache
reads are not turned into a silent data-loss event.

### 2. SQLite (DAL) — Normalized Offline Store

- **Owns:** Relational tables for guilds, roles, memberships, user_roles, guild_configs, access_checks
- **Schema:** Proper PKs and FKs — see `src/database/schema.ts`
- **Access:** Via DAL functions in `src/database/dal.ts` (e.g., `getGuildById`, `getRolesByGuildId`)
- **Not a cache:** This is the authoritative offline store; React Query is the in-memory cache on top

### 3. Zustand — Client-Only State

- **Owns:** UI state that has no server equivalent
  - `wallet.store.ts` — connection status, wallet address
  - `session.store.ts` — auth token, session status
  - `sync.store.ts` — sync metadata (entity versions, corrections)
  - `accessHistory.store.ts` — in-memory access check log
  - `reconciliation.store.ts` — role change sequence tracking
  - `biometric.store.ts` — biometric auth preference
  - `connectivityService.ts` — online/offline flag
- **Persistence:** SecureStore (via `migratingSecureStorage`) for sensitive data
- **No entity data:** Zustand stores never hold guild, role, or membership objects

---

## Adding New State

### New Server Entity (e.g., "events" feature)

1. **Add SQLite table** in `src/database/schema.ts` + migration in `src/database/migrations.ts`
2. **Add DAL functions** in `src/database/dal.ts` (upsert, getById, getByX)
3. **Add query key** in `src/lib/queryKeys.ts`:
   ```ts
   events: {
     all: ["events"] as const,
     byId: (id: string) => ["events", id] as const,
     byGuild: (guildId: string) => ["events", "guild", guildId] as const,
   },
   ```
4. **Add React Query hook** in `src/features/events/useEvents.ts`:
   ```ts
   export const useEvent = (eventId: string) =>
     useQuery({
       queryKey: queryKeys.events.byId(eventId),
       queryFn: () => guildPassClient.events.getEvent({ eventId }),
       networkMode: "offlineFirst",
     });
   ```
5. **Add DAL-backed resolution** in `src/database/queryAdapter.ts`:
   ```ts
   case "events": {
     const eventId = queryKey[1] as string;
     const event = await dal.getEventById(db, eventId);
     return event ? JSON.parse(event.raw_json) : undefined;
   }
   ```
6. **Register for persistence** in `src/lib/offlineCache.ts` (re-exports from `queryKeys.ts` automatically)
7. **Register for sync** in `src/features/sync/syncFetchers.ts` + diff logic in `src/features/sync/reconcile.ts`

### New Client-Only State (e.g., "theme preference")

1. **Create Zustand store** in `src/features/theme/theme.store.ts`:
   ```ts
   import { create } from "zustand";
   import { persist, createJSONStorage } from "zustand/middleware";
   import { migratingSecureStorage } from "../../lib/storage";

   type ThemeState = {
     darkMode: boolean;
     setDarkMode: (value: boolean) => void;
   };

   export const useThemeStore = create<ThemeState>()(
     persist(
       (set) => ({
         darkMode: false,
         setDarkMode: (darkMode) => set({ darkMode }),
       }),
       {
         name: "theme-storage",
         storage: createJSONStorage(() => migratingSecureStorage),
         partialize: (state) => ({ darkMode: state.darkMode }),
       },
     ),
   );
   ```
2. **Keep entity data out** — if the state references a guild, store only `guildId` and resolve display data from React Query selectors

---

## Normalization Rules

### DO embed in a query result:

- Resource-specific data that has no entity cache (e.g., `resourceName` in access history)
- Server response data that is not a cached entity reference (e.g., `matchedRoles` string array)

### DO NOT embed in a query result:

- Entity names that have a dedicated entity cache (e.g., guild names — use `["guild", guildId]` instead)
- Data from a different entity type (e.g., guild info in a memberships query)

### Reference, don't copy:

- Store entity `id`s, not entity snapshots
- Resolve display names at render time using selectors like `useResolvedGuildName(guildId)`
- Use `useQueries` to batch-resolve multiple entities efficiently

---

## The Query Key Factory

All query keys go through `src/lib/queryKeys.ts`:

```ts
import { queryKeys } from "../../lib/queryKeys";

// Creating keys
queryKeys.guild.byId("abc"); // → ["guild", "abc"]
queryKeys.membership.byWalletAndGuild("0x...", "abc"); // → ["membership", "0x...", "abc"]

// Root-level matching (for invalidations, sync engine)
queryKeys.membership.all; // → ["membership"]
queryKeys.guildRoles.all; // → ["guild-roles"]
```

This ensures consistency across:

- Query hooks (`useGuilds.ts`, `useMembership.ts`)
- Cache invalidation (`focusManager.ts`)
- Cache clearing (`walletScopedCache.ts`)
- Sync engine reconciliation (`reconcile.ts`)
- Offline persistence (`offlineCache.ts`, `queryAdapter.ts`)

---

## Cache Coherence Mechanisms

| Mechanism              | Trigger                   | What Happens                                                                      |
| ---------------------- | ------------------------- | --------------------------------------------------------------------------------- |
| **staleTime**          | 5 min after last fetch    | Queries auto-refetch on next mount                                                |
| **Foreground refetch** | App comes to foreground   | Invalidates `["membership"]` and `["user-roles"]`                                 |
| **Sync Engine**        | Offline→online transition | Refetches all cached entities, overwrites with server data, generates corrections |
| **Wallet disconnect**  | User disconnects wallet   | `clearWalletScopedCache()` removes all wallet-scoped queries                      |
| **Structural sharing** | React Query default       | Preserves object identity when data hasn't changed                                |

---

## Migration Path

If converting an existing screen from denormalized to normalized state:

1. **Identify embedded entity data.** Search for patterns like `guildName`, `roleName` embedded in query results or store entries.
2. **Strip the embed.** Return only IDs from the query/store.
3. **Add a resolver.** Use `useResolvedGuildName(guildId)` or create a similar hook.
4. **Update the screen.** Compose the base query with resolvers.
5. **Remove the old import.** Delete any now-unused fields from types.

### Example: Guild Name in Memberships (already migrated)

**Before:**

```ts
// useMembership.ts — query embeds guildName from SQLite
return { id: row.guild_id, name: guildName, isActive, roleCount };
```

**After:**

```ts
// useMembership.ts — returns normalized data
return { guildId: row.guild_id, isActive, roleCount };

// guilds.tsx — uses useEnrichedMemberships() which resolves guild names via React Query
<GuildCard name={item.guildName} id={item.guildId} ... />
```

---

## Testing

- **Store tests** (Zustand): Pure function tests — mock nothing, just call `getState().action()` and assert state
- **Query hook tests** (React Query): Use `QueryClientProvider` with a fresh `QueryClient` in test setup
- **Sync engine tests:** Inject mock fetchers and query client — see `tests/sync/syncEngine.test.ts`
- **DAL tests:** Use an in-memory SQLite database — see `tests/database/`

---

## Key Files

| File                              | Purpose                                      |
| --------------------------------- | -------------------------------------------- |
| `src/lib/queryKeys.ts`            | Centralized query key factory                |
| `src/lib/offlineCache.ts`         | Stale/GC times, re-exports persistable roots |
| `src/lib/queryClient.ts`          | QueryClient singleton                        |
| `src/database/dal.ts`             | SQLite data access layer                     |
| `src/database/queryAdapter.ts`    | DAL-backed offline query resolution          |
| `src/features/sync/syncEngine.ts` | Cache coherence engine                       |
| `src/features/sync/reconcile.ts`  | Entity diffing + correction generation       |
