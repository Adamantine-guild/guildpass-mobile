# Database Schema & ER Diagram

## Overview

GuildPass Mobile uses a local **SQLite** database (via `expo-sqlite`) as the offline-first data layer. The schema is **normalized** (3NF) to support efficient relational queries that a flat key-value cache cannot answer — for example, "all roles across all my wallets for guilds updated in the last week."

## Entity-Relationship Diagram

```mermaid
erDiagram
    guilds {
        TEXT id PK "Guild identifier"
        TEXT name "Display name"
        TEXT description "Optional description"
        TEXT icon_url "Optional icon URL"
        INTEGER chain_id "Blockchain chain ID"
        TEXT raw_json "Full API response JSON"
        TEXT created_at "ISO-8601"
        TEXT updated_at "ISO-8601"
    }

    guild_configs {
        TEXT id PK "Config identifier"
        TEXT guild_id FK "References guilds.id"
        TEXT config_json "Feature flags / settings JSON"
        TEXT created_at "ISO-8601"
        TEXT updated_at "ISO-8601"
    }

    wallets {
        INTEGER id PK "Auto-increment"
        TEXT address UK "Lowercase 0x-prefixed hex"
        TEXT label "Optional user label"
        TEXT added_at "ISO-8601"
    }

    roles {
        TEXT id PK_part "Role identifier"
        TEXT guild_id PK_part FK "References guilds.id"
        TEXT name "Role name"
        TEXT permissions "Optional permissions JSON"
        TEXT raw_json "Full API response JSON"
        TEXT created_at "ISO-8601"
        TEXT updated_at "ISO-8601"
    }

    memberships {
        INTEGER id PK "Auto-increment"
        TEXT wallet_address "Lowercase address"
        TEXT guild_id FK "References guilds.id"
        TEXT status "active | expired | revoked | unknown"
        TEXT raw_json "Full API response JSON"
        TEXT created_at "ISO-8601"
        TEXT updated_at "ISO-8601"
    }

    user_roles {
        INTEGER id PK "Auto-increment"
        TEXT wallet_address "Lowercase address"
        TEXT guild_id FK "References guilds.id"
        TEXT role_id "References roles.id"
        TEXT raw_json "Full API response JSON"
        TEXT created_at "ISO-8601"
        TEXT updated_at "ISO-8601"
    }

    access_checks {
        TEXT id PK "Check identifier"
        TEXT wallet_address "Lowercase address"
        TEXT guild_id "Guild identifier"
        TEXT resource_id "Scanned resource"
        TEXT status "granted | denied | error"
        TEXT reason "Optional denial reason"
        TEXT matched_roles_json "Matched roles JSON"
        TEXT required_roles_json "Required roles JSON"
        TEXT checked_at "ISO-8601"
        TEXT created_at "ISO-8601"
    }

    schema_migrations {
        INTEGER version PK "Migration version"
        TEXT name "Migration name"
        TEXT applied_at "ISO-8601"
    }

    guilds ||--o{ guild_configs : "has one"
    guilds ||--o{ roles : "has many"
    guilds ||--o{ memberships : "has many"
    guilds ||--o{ user_roles : "has many"
    wallets ||--o{ memberships : "has many"
    wallets ||--o{ user_roles : "has many"
    wallets ||--o{ access_checks : "has many"
```

## Table Details

### `guilds`

Core guild metadata fetched from the API.

| Column        | Type             | Notes                                    |
| ------------- | ---------------- | ---------------------------------------- |
| `id`          | TEXT PK          | Guild identifier from the API            |
| `name`        | TEXT NOT NULL    | Display name                             |
| `description` | TEXT             | Optional                                 |
| `icon_url`    | TEXT             | Optional                                 |
| `chain_id`    | INTEGER NOT NULL | Blockchain chain                         |
| `raw_json`    | TEXT NOT NULL    | Denormalized API payload for flexibility |
| `created_at`  | TEXT NOT NULL    | ISO-8601                                 |
| `updated_at`  | TEXT NOT NULL    | ISO-8601                                 |

### `guild_configs`

Per-guild configuration (feature flags, settings).

| Column        | Type                    | Notes                  |
| ------------- | ----------------------- | ---------------------- |
| `id`          | TEXT PK                 | Config identifier      |
| `guild_id`    | TEXT NOT NULL UNIQUE FK | References `guilds.id` |
| `config_json` | TEXT NOT NULL           | JSON blob              |
| `created_at`  | TEXT NOT NULL           | ISO-8601               |
| `updated_at`  | TEXT NOT NULL           | ISO-8601               |

### `wallets`

Locally-tracked wallet addresses (user-managed).

| Column     | Type                 | Notes                 |
| ---------- | -------------------- | --------------------- |
| `id`       | INTEGER PK           | Auto-increment        |
| `address`  | TEXT NOT NULL UNIQUE | Lowercase 0x-prefixed |
| `label`    | TEXT                 | Optional user label   |
| `added_at` | TEXT NOT NULL        | ISO-8601              |

### `roles`

Roles defined within a guild.

| Column        | Type              | Notes                     |
| ------------- | ----------------- | ------------------------- |
| `id`          | TEXT PK (part)    | Role identifier           |
| `guild_id`    | TEXT PK (part) FK | References `guilds.id`    |
| `name`        | TEXT NOT NULL     | Display name              |
| `permissions` | TEXT              | Optional permissions JSON |
| `raw_json`    | TEXT NOT NULL     | Denormalized API payload  |
| `created_at`  | TEXT NOT NULL     | ISO-8601                  |
| `updated_at`  | TEXT NOT NULL     | ISO-8601                  |

### `memberships`

Wallet membership in a guild. Unique per (wallet, guild) pair.

| Column           | Type             | Notes                                    |
| ---------------- | ---------------- | ---------------------------------------- |
| `id`             | INTEGER PK       | Auto-increment                           |
| `wallet_address` | TEXT NOT NULL    | Lowercase                                |
| `guild_id`       | TEXT NOT NULL FK | References `guilds.id`                   |
| `status`         | TEXT NOT NULL    | CHECK: active, expired, revoked, unknown |
| `raw_json`       | TEXT NOT NULL    | Denormalized API payload                 |
| `created_at`     | TEXT NOT NULL    | ISO-8601                                 |
| `updated_at`     | TEXT NOT NULL    | ISO-8601                                 |

### `user_roles`

Roles assigned to a wallet within a guild. Unique per (wallet, guild, role) tuple.

| Column           | Type             | Notes                    |
| ---------------- | ---------------- | ------------------------ |
| `id`             | INTEGER PK       | Auto-increment           |
| `wallet_address` | TEXT NOT NULL    | Lowercase                |
| `guild_id`       | TEXT NOT NULL FK | References `guilds.id`   |
| `role_id`        | TEXT NOT NULL    | References `roles.id`    |
| `raw_json`       | TEXT NOT NULL    | Denormalized API payload |
| `created_at`     | TEXT NOT NULL    | ISO-8601                 |
| `updated_at`     | TEXT NOT NULL    | ISO-8601                 |

### `access_checks`

History of access-check operations.

| Column                | Type          | Notes                         |
| --------------------- | ------------- | ----------------------------- |
| `id`                  | TEXT PK       | Unique check identifier       |
| `wallet_address`      | TEXT NOT NULL | Lowercase                     |
| `guild_id`            | TEXT NOT NULL | Guild identifier              |
| `resource_id`         | TEXT NOT NULL | Scanned resource              |
| `status`              | TEXT NOT NULL | CHECK: granted, denied, error |
| `reason`              | TEXT          | Optional denial reason        |
| `matched_roles_json`  | TEXT          | JSON array                    |
| `required_roles_json` | TEXT          | JSON array                    |
| `checked_at`          | TEXT NOT NULL | ISO-8601                      |
| `created_at`          | TEXT NOT NULL | ISO-8601                      |

## Indexes

| Index                       | Columns                         | Purpose                           |
| --------------------------- | ------------------------------- | --------------------------------- |
| `idx_guilds_updated_at`     | `guilds(updated_at)`            | "Recently updated guilds" queries |
| `idx_roles_guild_id`        | `roles(guild_id)`               | Lookup roles by guild             |
| `idx_memberships_wallet`    | `memberships(wallet_address)`   | Lookup memberships by wallet      |
| `idx_memberships_guild`     | `memberships(guild_id)`         | Lookup memberships by guild       |
| `idx_user_roles_wallet`     | `user_roles(wallet_address)`    | Lookup roles by wallet            |
| `idx_user_roles_guild`      | `user_roles(guild_id)`          | Lookup roles by guild             |
| `idx_access_checks_wallet`  | `access_checks(wallet_address)` | Paginated access history          |
| `idx_access_checks_guild`   | `access_checks(guild_id)`       | Access history by guild           |
| `idx_access_checks_checked` | `access_checks(checked_at)`     | Recent checks / cleanup           |

## Performance Target

With a synthetic dataset of **500 guilds × 10 roles each** (5,000 roles) and **50 wallets × 20 access checks each** (1,000 checks):

| Query                                    | Target  | Rationale                      |
| ---------------------------------------- | ------- | ------------------------------ |
| `getAllGuilds`                           | < 100ms | Full table scan with ~500 rows |
| `getRolesByGuildId`                      | < 50ms  | Indexed lookup, ~10 rows       |
| `getMembershipsByWallet`                 | < 50ms  | Indexed lookup, ~10 rows       |
| `getAccessChecksByWallet` (paginated)    | < 50ms  | Indexed, limited to 20 rows    |
| `getUserRolesForRecentlyUpdatedGuilds`   | < 200ms | JOIN with filtering            |
| Synthetic data generation (500/10/50/20) | < 5s    | Bulk insert in transaction     |
