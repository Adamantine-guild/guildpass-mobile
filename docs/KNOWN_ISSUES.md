# Known Issues

## `@guildpass/sdk` cannot be resolved in `tests/api.test.ts`

Vite cannot resolve the entry point for the `@guildpass/sdk` package, which
prevents `tests/api.test.ts` from running.

This issue predates the API-layer refactor in issue #218. It was reproduced
against the original repository state after stashing all refactor changes, and
then reproduced again after restoring them.

Resolving the SDK package entry point is outside the scope of refactor #218 and
does not block that work. It should be investigated separately.

## Project typecheck fails on pre-existing JSX syntax errors

Running `tsc --noEmit` fails with multiple JSX syntax errors in:

- `app/access-check.tsx`
- `app/access-scanner.tsx`
- `app/deep-link-error.tsx`
- `app/pending-changes.tsx`
- `app/profile.tsx`

These errors predate this PR. The contents of all five files were verified to
match `upstream/main` byte for byte, and none of the errors are related to the
files changed by this PR.

This does not block the API-layer refactor, but the
`pnpm typecheck passes` checklist item cannot be marked honestly until the
base-branch errors are resolved separately.

## GuildPass SDK does not support app session token injection

The GuildPass SDK does not currently expose a mechanism to inject the app's
session token or refresh it. Current Guilds SDK requests are public and
anonymous, so this does not block the Guilds migration pilot.

If an SDK endpoint requires app session authentication in the future, the SDK
or the `guildpassClient.ts` integration will need to be extended to accept and
refresh session credentials.

## Refactor #218 - Progress

- Guilds: migrated to the centralized service layer and verified.
- Membership: pending.
- Access: pending.
- Notifications: pending.
- Attestation: pending.
