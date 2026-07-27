# Optimistic Updates

GuildPass uses TanStack Query for server state and should prefer optimistic
updates only when the user action is reversible and the app can restore the
previous cache value on failure.

## When to use optimism

Use an optimistic cache update for low-risk user preferences, drafts, and other
queueable mutations where the submitted payload is the expected final state.

Do not optimistically grant credentials, access decisions, membership status, or
role ownership. Those values are security-sensitive and must be shown only after
the backend, local credential verifier, or sync engine produces an authoritative
result.

## Pattern

1. Give every affected view a stable query key in `src/lib/queryKeys.ts`.
2. In `onMutate`, cancel the exact affected queries, snapshot the current data,
   and write the optimistic value with `applyOptimisticCacheUpdates`.
3. In `onError`, call `rollbackOptimisticCacheUpdates` with the context returned
   from `onMutate`.
4. In `onSuccess`, write the authoritative response into the exact cache entry.
   Avoid broad invalidation when the response already contains the final state.
5. Use targeted invalidation only when the mutation changes data that must be
   recomputed by active queries, such as an issuer-key refresh invalidating
   active attestation checks for one guild.

## Current behavior

Preference updates write a pending cache entry immediately and roll back to the
previous preferences when the mutation fails.

Access checks are confirmed-only. Successful checks are written to
`queryKeys.accessCheck.byParams(walletAddress, guildId, resourceId)` so any
screen reading the same result can reuse it without an extra request.

Attestation fetches write exact verification, existence, and per-guild aggregate
queries from the verified result. Invalid verified results remove stale aggregate
entries for the affected role.
