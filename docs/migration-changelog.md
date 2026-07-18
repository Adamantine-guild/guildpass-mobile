# Migration Changelog

All schema changes to the local SQLite database are tracked here as versioned migrations.
Each migration is applied **incrementally** by the migration runner at app startup.

## How Migrations Work

1. On launch, the migration runner queries `schema_migrations` for the current version.
2. All pending migrations (version > current) are applied **in order**, each inside a transaction.
3. On success, the version is recorded in `schema_migrations`.
4. Migrations are **idempotent** — running them on an already-migrated database is a no-op.

## Version History

### v1 — Initial Schema (2026-07-18)

**File:** `src/database/schema.ts` (see `SCHEMA_VERSION_1`)

Creates the full normalized schema:

| Table | Purpose |
|-------|---------|
| `schema_migrations` | Tracks applied migrations |
| `guilds` | Core guild metadata |
| `guild_configs` | Per-guild configuration |
| `wallets` | Locally-tracked wallet addresses |
| `roles` | Guild roles |
| `memberships` | Wallet memberships in guilds |
| `user_roles` | Roles assigned to wallets |
| `access_checks` | Access-check history |

Also creates performance indexes on frequently queried columns.

### Future Versions

```
v2 — Reserved for schema evolution (e.g., adding new columns)
v3 — Reserved for schema evolution
...
```

## Safety

- **Corruption detection:** The database runs `PRAGMA integrity_check` on every launch. If the check fails, the entire database is deleted and recreated from scratch (the API serves as the source of truth).
- **Rollback:** Each migration runs in a SQLite transaction. If a migration fails, the transaction is rolled back automatically and the version is not recorded.
- **Downgrade protection:** The runner only applies migrations with a version greater than the current version. It does not support down-migrations (schema rollback).
