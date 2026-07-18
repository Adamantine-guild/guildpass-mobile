# Query cache policy

GuildPass mobile uses TanStack Query for SDK-backed server state. The cache policy is intentionally tuned per data volatility so the UI can render cached data immediately while revalidating in the background.

## Policy table

| Query type | Example hooks | Stale time | Cache time | Rationale |
| --- | --- | ---: | ---: | --- |
| Guild metadata | guild detail, guild config | 5 min | 24h | Guild metadata changes rarely; stale data should be shown immediately while a refetch happens in the background. |
| Guild roles | roles list | 30s | 15 min | Roles can change more frequently than guild metadata, so the cache should refresh sooner. |
| Membership | membership status | 30s | 15 min | Membership state is user-specific and can change after actions such as onboarding or role updates. |
| User roles | user roles for a guild | 30s | 15 min | Role assignments can change more often than guild metadata. |

## Default behavior

- The app uses `networkMode: "offlineFirst"` for all SDK-backed queries.
- Cached data is considered stale after the domain-specific window above and is revalidated in the background.
- The UI should keep rendering the existing cached result until fresh data arrives, avoiding a full loading spinner when valid data is already present.
