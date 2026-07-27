/**
 * Pure reconciliation logic for the sync engine (Issue #108).
 *
 * Everything in this module is side-effect free so conflict detection can be
 * unit-tested without a network, a QueryClient, or any UI.
 */

import { isWalletScopedQueryRoot } from "../../lib/queryKeys";
import type {
  SyncCorrection,
  SyncCorrectionSeverity,
  SyncCorrectionType,
  SyncEntityDescriptor,
  SyncEntityKind,
} from "./sync.types";

/** Query-key roots the reconciliation pass covers. Being persistable and being
 * server-reconcilable are separate properties; aggregate/client-only roots
 * such as "memberships" are persisted but refreshed indirectly. */
export const RECONCILED_QUERY_KEY_ROOTS: readonly SyncEntityKind[] = [
  "membership",
  "user-roles",
  "guild",
  "guild-config",
  "guild-roles",
];

/**
 * Parses a React Query key into a sync entity descriptor.
 * Returns null for keys the sync engine does not reconcile.
 *
 * Expected shapes:
 *   ["membership", walletAddress, guildId]
 *   ["user-roles", walletAddress, guildId]
 *   ["guild", guildId] / ["guild-config", guildId] / ["guild-roles", guildId]
 */
export function describeSyncableQuery(queryKey: readonly unknown[]): SyncEntityDescriptor | null {
  const root = queryKey[0];
  if (typeof root !== "string") return null;
  const kind = RECONCILED_QUERY_KEY_ROOTS.find((k) => k === root);
  if (!kind) return null;

  if (isWalletScopedQueryRoot(root)) {
    const [, walletAddress, guildId] = queryKey;
    if (typeof walletAddress !== "string" || typeof guildId !== "string") {
      return null;
    }
    return { kind, queryKey, guildId, walletAddress };
  }

  const [, guildId] = queryKey;
  if (typeof guildId !== "string") return null;
  return { kind, queryKey, guildId, walletAddress: null };
}

// ---------------------------------------------------------------------------
// Entity versioning – content-derived so it works with an untyped SDK that
// exposes no server-side version/etag.
// ---------------------------------------------------------------------------

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "undefined";
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`);
  return `{${entries.join(",")}}`;
}

/** FNV-1a hash of the stable serialization, hex-encoded. */
export function computeEntityVersion(data: unknown): string {
  const input = stableStringify(data);
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function entityVersionsDiffer(cached: unknown, fresh: unknown): boolean {
  return computeEntityVersion(cached) !== computeEntityVersion(fresh);
}

// ---------------------------------------------------------------------------
// Conflict detection
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Extracts a display name per role from the untyped SDK role arrays. */
function roleNames(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const names: string[] = [];
  for (const entry of value) {
    if (typeof entry === "string") {
      names.push(entry);
    } else if (isRecord(entry) && typeof entry.name === "string") {
      names.push(entry.name);
    } else if (isRecord(entry) && typeof entry.id === "string") {
      names.push(entry.id);
    } else {
      return null; // unknown shape – skip conflict detection for this entity
    }
  }
  return names;
}

function correctionId(type: SyncCorrectionType, descriptor: SyncEntityDescriptor): string {
  return [type, descriptor.kind, descriptor.guildId, descriptor.walletAddress ?? "-"].join(":");
}

function makeCorrection(
  type: SyncCorrectionType,
  severity: SyncCorrectionSeverity,
  descriptor: SyncEntityDescriptor,
  message: string,
  detectedAtMs: number,
): SyncCorrection {
  return {
    id: correctionId(type, descriptor),
    type,
    severity,
    entityKind: descriptor.kind,
    guildId: descriptor.guildId,
    walletAddress: descriptor.walletAddress,
    message,
    detectedAt: new Date(detectedAtMs).toISOString(),
  };
}

/**
 * Resolves an untyped membership payload to its active flag. A `null`
 * payload means the membership no longer exists server-side, which for
 * conflict purposes is the same as inactive — this is the primary
 * "revoked while offline" shape and must not slip through as "malformed".
 */
function membershipActiveFlag(value: unknown): boolean | null {
  if (value === null) return false;
  if (isRecord(value) && typeof value.isActive === "boolean") return value.isActive;
  return null; // unknown shape – skip conflict detection
}

function diffMembership(
  descriptor: SyncEntityDescriptor,
  cached: unknown,
  fresh: unknown,
  now: number,
): SyncCorrection[] {
  const cachedActive = membershipActiveFlag(cached);
  const freshActive = membershipActiveFlag(fresh);
  if (cachedActive === null || freshActive === null) {
    return [];
  }
  if (cachedActive && !freshActive) {
    return [
      makeCorrection(
        "membership_revoked",
        "critical",
        descriptor,
        `Your membership in guild "${descriptor.guildId}" is no longer active. Access shown while you were offline may have been out of date.`,
        now,
      ),
    ];
  }
  if (!cachedActive && freshActive) {
    return [
      makeCorrection(
        "membership_restored",
        "info",
        descriptor,
        `Your membership in guild "${descriptor.guildId}" is now active.`,
        now,
      ),
    ];
  }
  return [];
}

function diffUserRoles(
  descriptor: SyncEntityDescriptor,
  cached: unknown,
  fresh: unknown,
  now: number,
): SyncCorrection[] {
  const cachedRoles = roleNames(cached);
  // A null role payload means the server no longer has roles for this user —
  // equivalent to an empty list, and the critical case when roles were cached.
  const freshRoles = fresh === null ? [] : roleNames(fresh);
  if (!cachedRoles || !freshRoles) return [];

  const freshSet = new Set(freshRoles);
  const cachedSet = new Set(cachedRoles);
  const removed = cachedRoles.filter((name) => !freshSet.has(name));
  const added = freshRoles.filter((name) => !cachedSet.has(name));

  const corrections: SyncCorrection[] = [];
  if (removed.length > 0) {
    corrections.push(
      makeCorrection(
        "roles_removed",
        "critical",
        descriptor,
        `Roles removed in guild "${descriptor.guildId}" while you were offline: ${removed.join(", ")}. Access based on these roles is no longer valid.`,
        now,
      ),
    );
  }
  if (added.length > 0) {
    corrections.push(
      makeCorrection(
        "roles_added",
        "info",
        descriptor,
        `New roles granted in guild "${descriptor.guildId}": ${added.join(", ")}.`,
        now,
      ),
    );
  }
  return corrections;
}

function diffGuild(
  descriptor: SyncEntityDescriptor,
  cached: Record<string, unknown>,
  fresh: Record<string, unknown>,
  now: number,
): SyncCorrection[] {
  if (typeof cached.isActive !== "boolean" || typeof fresh.isActive !== "boolean") {
    return [];
  }
  if (cached.isActive && !fresh.isActive) {
    return [
      makeCorrection(
        "guild_deactivated",
        "critical",
        descriptor,
        `Guild "${descriptor.guildId}" was deactivated while you were offline. Cached access results for it are no longer valid.`,
        now,
      ),
    ];
  }
  return [];
}

function diffGuildConfig(
  descriptor: SyncEntityDescriptor,
  cached: Record<string, unknown>,
  fresh: Record<string, unknown>,
  now: number,
): SyncCorrection[] {
  const policyChanged =
    typeof cached.accessPolicy === "string" &&
    typeof fresh.accessPolicy === "string" &&
    cached.accessPolicy !== fresh.accessPolicy;
  const rolesChanged =
    Array.isArray(cached.requiredRoles) &&
    Array.isArray(fresh.requiredRoles) &&
    entityVersionsDiffer(cached.requiredRoles, fresh.requiredRoles);

  if (!policyChanged && !rolesChanged) return [];
  return [
    makeCorrection(
      "access_policy_changed",
      "info",
      descriptor,
      `Access requirements for guild "${descriptor.guildId}" changed while you were offline. Previous access results may no longer apply.`,
      now,
    ),
  ];
}

/**
 * Compares a cached entity against fresh server state and returns the
 * corrections that should be surfaced to the user.
 *
 * The server value is always authoritative regardless of what this returns —
 * corrections only control what the UI announces, never which value wins.
 * Unknown/malformed shapes yield no corrections (the overwrite still happens).
 */
export function diffEntity(
  descriptor: SyncEntityDescriptor,
  cached: unknown,
  fresh: unknown,
  detectedAtMs: number,
): SyncCorrection[] {
  switch (descriptor.kind) {
    case "membership":
      return diffMembership(descriptor, cached, fresh, detectedAtMs);
    case "user-roles":
      return diffUserRoles(descriptor, cached, fresh, detectedAtMs);
    case "guild":
      if (!isRecord(cached) || !isRecord(fresh)) return [];
      return diffGuild(descriptor, cached, fresh, detectedAtMs);
    case "guild-config":
      if (!isRecord(cached) || !isRecord(fresh)) return [];
      return diffGuildConfig(descriptor, cached, fresh, detectedAtMs);
    case "guild-roles":
      // Guild-wide role catalogs are refreshed silently; they do not change
      // what the current user can access on their own.
      return [];
    default:
      // memberships, profile, user-profile — no diff logic yet; the server
      // value is adopted silently with no corrections surfaced.
      return [];
  }
}
