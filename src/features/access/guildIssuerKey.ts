import { sha256, toHex } from "viem";
import { guildPassClient } from "../../lib/guildpassClient";
import { migratingSecureStorage } from "../../lib/storage";
import {
  QrSignatureError,
  QR_SIGNATURE_ERROR_CODES,
  type QrSignatureErrorCode,
} from "./qrSignature";
import {
  classifyRegistryFreshness,
  type FreshnessPolicy,
} from "../../lib/credentials/registryFreshness";
import type {
  CredentialIssuerRegistry,
  IssuerKeyLookup,
  IssuerKeyRef,
  IssuerKeyUnavailableReason,
} from "../../lib/credentials/credentialIssuer.types";

/**
 * Key Registry & Issuer Public Key Manager
 *
 * Manages versioned issuer public keys and key revocation state per guild.
 * Supports:
 *  - Key ID (kid) lookup for rotating keys with rotation overlap.
 *  - Tracking and rejection of revoked key IDs.
 *  - Bounded TTL cache for key registry data.
 *  - Safe offline-fallback behavior (re-uses cached registry within a trust window,
 *    refuses unverifiable payloads if expired or uncached).
 */

export type IssuerKeyEntry = {
  kid: string;
  publicKey: string;
  status?: "active" | "revoked";
};

export type GuildConfigWithIssuerKeys = {
  guildId: string;
  issuerPublicKey?: string;
  issuerKeys?: Record<string, string> | Array<IssuerKeyEntry>;
  revokedKids?: string[];
  [key: string]: unknown;
};

export type GuildKeyRegistry = {
  guildId: string;
  keys: Map<string, string>;
  revokedKids: Set<string>;
  fetchedAt: number;
  legacyPublicKey?: string;
};

/** Default bounded TTL for key registry cache: 15 minutes */
export const DEFAULT_KEY_REGISTRY_CACHE_TTL_MS = 15 * 60 * 1000;

/** Default offline trust window for cached registry fallback: 24 hours */
export const DEFAULT_KEY_REGISTRY_OFFLINE_TRUST_WINDOW_MS = 24 * 60 * 60 * 1000;

let currentCacheTtlMs = DEFAULT_KEY_REGISTRY_CACHE_TTL_MS;
let currentOfflineTrustWindowMs = DEFAULT_KEY_REGISTRY_OFFLINE_TRUST_WINDOW_MS;

const registryCache = new Map<string, GuildKeyRegistry>();

type SerializedGuildKeyRegistry = {
  version: 1;
  guildId: string;
  keys: Array<[string, string]>;
  revokedKids: string[];
  fetchedAt: number;
  legacyPublicKey?: string;
  checksum: string;
};

type RegistryChecksumPayload = Omit<SerializedGuildKeyRegistry, "checksum">;

const GUILD_KEY_REGISTRY_STORAGE_PREFIX = "guildpass:access-key-registry:v1:";

const getPersistentRegistryStorageKey = (guildId: string): string =>
  `${GUILD_KEY_REGISTRY_STORAGE_PREFIX}${guildId}`;

const buildRegistryChecksumPayload = (
  registry: GuildKeyRegistry,
): RegistryChecksumPayload => ({
  version: 1,
  guildId: registry.guildId,
  keys: Array.from(registry.keys.entries()).sort(([left], [right]) => left.localeCompare(right)),
  revokedKids: Array.from(registry.revokedKids.values()).sort(),
  fetchedAt: registry.fetchedAt,
  ...(registry.legacyPublicKey ? { legacyPublicKey: registry.legacyPublicKey } : {}),
});

const createRegistryChecksum = (payload: RegistryChecksumPayload): string =>
  sha256(toHex(JSON.stringify(payload)));

const serializeRegistry = (registry: GuildKeyRegistry): string => {
  const payload = buildRegistryChecksumPayload(registry);
  const serialized: SerializedGuildKeyRegistry = {
    ...payload,
    checksum: createRegistryChecksum(payload),
  };
  return JSON.stringify(serialized);
};

const deserializeRegistry = (raw: string, expectedGuildId: string): GuildKeyRegistry | null => {
  try {
    const parsed = JSON.parse(raw) as Partial<SerializedGuildKeyRegistry>;
    const guildId = parsed.guildId;
    const fetchedAt = parsed.fetchedAt;
    const serializedKeys = parsed.keys;
    const serializedRevokedKids = parsed.revokedKids;
    const checksum = parsed.checksum;

    if (
      parsed.version !== 1 ||
      typeof guildId !== "string" ||
      guildId !== expectedGuildId ||
      typeof fetchedAt !== "number" ||
      !Number.isFinite(fetchedAt) ||
      !Array.isArray(serializedKeys) ||
      !Array.isArray(serializedRevokedKids) ||
      typeof checksum !== "string"
    ) {
      return null;
    }

    const keys = new Map<string, string>();
    for (const entry of serializedKeys) {
      if (
        !Array.isArray(entry) ||
        entry.length !== 2 ||
        typeof entry[0] !== "string" ||
        typeof entry[1] !== "string"
      ) {
        return null;
      }
      keys.set(entry[0], entry[1]);
    }

    const revokedKids = new Set<string>();
    for (const kid of serializedRevokedKids) {
      if (typeof kid !== "string") return null;
      revokedKids.add(kid);
      keys.delete(kid);
    }

    const payload: RegistryChecksumPayload = {
      version: 1,
      guildId,
      keys: Array.from(keys.entries()).sort(([left], [right]) => left.localeCompare(right)),
      revokedKids: Array.from(revokedKids.values()).sort(),
      fetchedAt,
      ...(typeof parsed.legacyPublicKey === "string"
        ? { legacyPublicKey: parsed.legacyPublicKey }
        : {}),
    };

    if (createRegistryChecksum(payload) !== checksum) {
      return null;
    }

    return {
      guildId,
      keys,
      revokedKids,
      fetchedAt,
      ...(typeof parsed.legacyPublicKey === "string"
        ? { legacyPublicKey: parsed.legacyPublicKey }
        : {}),
    };
  } catch {
    return null;
  }
};

const loadPersistedRegistry = async (guildId: string): Promise<GuildKeyRegistry | null> => {
  const storageKey = getPersistentRegistryStorageKey(guildId);
  try {
    const raw = await migratingSecureStorage.getItem(storageKey);
    if (raw === null) return null;

    const registry = deserializeRegistry(raw, guildId);
    if (registry === null) {
      await migratingSecureStorage.removeItem(storageKey);
    }
    return registry;
  } catch (error) {
    console.warn(`Failed to load persisted key registry for guild ${guildId}:`, error);
    return null;
  }
};

const persistRegistry = async (registry: GuildKeyRegistry): Promise<void> => {
  try {
    await migratingSecureStorage.setItem(
      getPersistentRegistryStorageKey(registry.guildId),
      serializeRegistry(registry),
    );
  } catch (error) {
    console.warn(`Failed to persist key registry for guild ${registry.guildId}:`, error);
  }
};

const cacheRegistry = async (registry: GuildKeyRegistry): Promise<GuildKeyRegistry> => {
  registryCache.set(registry.guildId, registry);
  await persistRegistry(registry);
  return registry;
};

export const clearIssuerKeyCache = (): void => {
  registryCache.clear();
};

export const setKeyRegistryCacheTtlMs = (ttlMs: number): void => {
  currentCacheTtlMs = ttlMs;
};

export const setKeyRegistryOfflineTrustWindowMs = (trustWindowMs: number): void => {
  currentOfflineTrustWindowMs = trustWindowMs;
};

export const resetKeyRegistryTimeouts = (): void => {
  currentCacheTtlMs = DEFAULT_KEY_REGISTRY_CACHE_TTL_MS;
  currentOfflineTrustWindowMs = DEFAULT_KEY_REGISTRY_OFFLINE_TRUST_WINDOW_MS;
};

/**
 * Read the *current* timeouts each call — the setters above are used by tests to
 * shrink the boundaries, so this policy cannot be hoisted to a constant.
 *
 * The trust window is inclusive here: a registry exactly `offlineTrustWindowMs`
 * old is still served offline. That has always been this path's behaviour and the
 * boundary tests pin it.
 */
const qrFreshnessPolicy = (): FreshnessPolicy => ({
  ttlMs: currentCacheTtlMs,
  offlineTrustWindowMs: currentOfflineTrustWindowMs,
  trustWindowBoundary: "inclusive",
});

const parseKeyRegistryConfig = (
  config: GuildConfigWithIssuerKeys,
  fetchedAt: number,
): GuildKeyRegistry => {
  const keys = new Map<string, string>();
  const revokedKids = new Set<string>();

  // Process issuerKeys if provided
  if (config.issuerKeys) {
    if (Array.isArray(config.issuerKeys)) {
      for (const entry of config.issuerKeys) {
        if (entry && typeof entry.kid === "string" && typeof entry.publicKey === "string") {
          const kid = entry.kid.trim();
          const pubKey = entry.publicKey.trim();
          if (entry.status === "revoked") {
            revokedKids.add(kid);
          } else {
            keys.set(kid, pubKey);
          }
        }
      }
    } else if (typeof config.issuerKeys === "object" && config.issuerKeys !== null) {
      for (const [kid, pubKey] of Object.entries(config.issuerKeys)) {
        if (typeof pubKey === "string" && pubKey.trim().length > 0) {
          keys.set(kid.trim(), pubKey.trim());
        }
      }
    }
  }

  // Process revokedKids list if provided
  if (Array.isArray(config.revokedKids)) {
    for (const kid of config.revokedKids) {
      if (typeof kid === "string" && kid.trim().length > 0) {
        const trimmedKid = kid.trim();
        revokedKids.add(trimmedKid);
        keys.delete(trimmedKid); // Revocation takes precedence
      }
    }
  }

  let legacyPublicKey: string | undefined;
  if (typeof config.issuerPublicKey === "string" && config.issuerPublicKey.trim().length > 0) {
    legacyPublicKey = config.issuerPublicKey.trim();
  }

  return {
    guildId: config.guildId,
    keys,
    revokedKids,
    fetchedAt,
    legacyPublicKey,
  };
};

/**
 * Fetch fresh key registry from SDK for a guild.
 */
const fetchGuildKeyRegistry = async (
  guildId: string,
  now: Date = new Date(),
): Promise<GuildKeyRegistry> => {
  let config: GuildConfigWithIssuerKeys;
  try {
    config = (await guildPassClient.guilds.getGuildConfig({
      guildId,
    })) as GuildConfigWithIssuerKeys;
  } catch (err) {
    throw new QrSignatureError(
      QR_SIGNATURE_ERROR_CODES.PUBLIC_KEY_UNAVAILABLE,
      "Unable to fetch guild issuer key registry.",
    );
  }

  if (!config) {
    throw new QrSignatureError(
      QR_SIGNATURE_ERROR_CODES.PUBLIC_KEY_UNAVAILABLE,
      "Guild config returned empty or invalid data.",
    );
  }

  return parseKeyRegistryConfig(config, now.getTime());
};

type RegistryFailure = {
  ok: false;
  code: QrSignatureErrorCode;
  message: string;
  reason: IssuerKeyUnavailableReason;
};

type RegistryResolution = { ok: true; registry: GuildKeyRegistry } | RegistryFailure;

/** Refresh attempt that reports failure instead of throwing. */
const attemptRegistryRefresh = async (
  guildId: string,
  now: Date,
): Promise<{ ok: true; registry: GuildKeyRegistry } | { ok: false }> => {
  try {
    return { ok: true, registry: await fetchGuildKeyRegistry(guildId, now) };
  } catch {
    return { ok: false };
  }
};

/**
 * Resolve a guild's key registry, enforcing TTL and offline fallback policy, and
 * *reporting* failure rather than throwing.
 *
 * Both public surfaces are built on this: `getGuildKeyRegistry()` re-throws the
 * failure as the `QrSignatureError` it always threw, and the non-throwing
 * `CredentialIssuerRegistry` implementation maps it to an `unavailable` status.
 *
 * This path keeps its network refresh — unlike the attestation registry, which is
 * push-populated and never fetches.
 */
const resolveGuildKeyRegistry = async (
  guildId: string,
  now: Date,
): Promise<RegistryResolution> => {
  const nowMs = now.getTime();
  const cached = registryCache.get(guildId);

  if (cached !== undefined) {
    const freshness = classifyRegistryFreshness(cached.fetchedAt, nowMs, qrFreshnessPolicy());
    if (freshness === "fresh") {
      return { ok: true, registry: cached };
    }

    // Cache expired: try to refresh
    const refreshed = await attemptRegistryRefresh(guildId, now);
    if (refreshed.ok) {
      return { ok: true, registry: await cacheRegistry(refreshed.registry) };
    }

    // Refresh failed (e.g. offline): safe fallback while inside the trust window
    if (freshness === "stale_trusted") {
      return { ok: true, registry: cached };
    }

    // Past trust window: reject
    return {
      ok: false,
      code: QR_SIGNATURE_ERROR_CODES.KEY_REGISTRY_EXPIRED,
      message: "Guild key registry cache expired and could not be refreshed offline.",
      reason: "registry_expired",
    };
  }

  const persisted = await loadPersistedRegistry(guildId);
  if (persisted !== null) {
    registryCache.set(guildId, persisted);
    const freshness = classifyRegistryFreshness(persisted.fetchedAt, nowMs, qrFreshnessPolicy());

    if (freshness === "fresh") {
      return { ok: true, registry: persisted };
    }

    const refreshed = await attemptRegistryRefresh(guildId, now);
    if (refreshed.ok) {
      return { ok: true, registry: await cacheRegistry(refreshed.registry) };
    }

    if (freshness === "stale_trusted") {
      return { ok: true, registry: persisted };
    }

    return {
      ok: false,
      code: QR_SIGNATURE_ERROR_CODES.KEY_REGISTRY_EXPIRED,
      message: "Persisted guild key registry cache expired and could not be refreshed offline.",
      reason: "registry_expired",
    };
  }

  // No memory or persisted entry: must fetch online
  try {
    const freshRegistry = await fetchGuildKeyRegistry(guildId, now);
    return { ok: true, registry: await cacheRegistry(freshRegistry) };
  } catch (error) {
    if (error instanceof QrSignatureError) {
      return { ok: false, code: error.code, message: error.message, reason: "fetch_failed" };
    }
    // Anything that is not a QrSignatureError propagates untouched, as before.
    throw error;
  }
};

/**
 * Get key registry for a guild, enforcing TTL and offline fallback policy.
 */
export const getGuildKeyRegistry = async (
  guildId: string,
  now: Date = new Date(),
): Promise<GuildKeyRegistry> => {
  const resolution = await resolveGuildKeyRegistry(guildId, now);

  if (!resolution.ok) {
    throw new QrSignatureError(resolution.code, resolution.message);
  }

  return resolution.registry;
};

/**
 * Resolve the public key for a guild payload by `kid` or legacy fallback,
 * reporting revocation and unknown-key outcomes rather than throwing.
 */
const lookupGuildIssuerKey = async (
  guildId: string,
  ref: IssuerKeyRef | null,
  now: Date,
): Promise<IssuerKeyLookup> => {
  const resolution = await resolveGuildKeyRegistry(guildId, now);

  if (!resolution.ok) {
    return { status: "unavailable", reason: resolution.reason, detail: resolution.message };
  }

  const registry = resolution.registry;

  if (ref !== null && ref.kind === "kid" && ref.kid.trim().length > 0) {
    const cleanKid = ref.kid.trim();

    // 1. Check if kid is revoked
    if (registry.revokedKids.has(cleanKid)) {
      return { status: "revoked", ref: { kind: "kid", kid: cleanKid } };
    }

    // 2. Look up public key for kid
    const pubKey = registry.keys.get(cleanKid);
    if (pubKey !== undefined) {
      return { status: "active", keyMaterial: pubKey };
    }

    // 3. Kid not found in active keys
    return { status: "unknown", ref: { kind: "kid", kid: cleanKid } };
  }

  // Kid is omitted: check legacy / single-key fallbacks
  if (registry.legacyPublicKey !== undefined) {
    return { status: "active", keyMaterial: registry.legacyPublicKey };
  }

  if (registry.keys.size === 1) {
    return { status: "active", keyMaterial: registry.keys.values().next().value! };
  }

  if (registry.keys.size > 1) {
    return {
      status: "unavailable",
      reason: "ambiguous_key",
      detail:
        "QR code is missing a key ID (kid) required to select among multiple active issuer keys.",
    };
  }

  return {
    status: "unavailable",
    reason: "no_usable_key",
    detail: "Guild config does not publish a usable issuer public key.",
  };
};

const UNAVAILABLE_REASON_TO_QR_CODE: Record<IssuerKeyUnavailableReason, QrSignatureErrorCode> = {
  no_registry_data: QR_SIGNATURE_ERROR_CODES.PUBLIC_KEY_UNAVAILABLE,
  registry_expired: QR_SIGNATURE_ERROR_CODES.KEY_REGISTRY_EXPIRED,
  fetch_failed: QR_SIGNATURE_ERROR_CODES.PUBLIC_KEY_UNAVAILABLE,
  no_usable_key: QR_SIGNATURE_ERROR_CODES.PUBLIC_KEY_UNAVAILABLE,
  ambiguous_key: QR_SIGNATURE_ERROR_CODES.MISSING_KID,
};

/**
 * Resolve the public key for a guild payload by `kid` or legacy fallback.
 * Checks key revocation and unknown key errors.
 *
 * Calls `lookupGuildIssuerKey` directly rather than going through the global
 * credential registry: this gates access, so it must not depend on whether
 * bootstrap registration has run yet.
 */
export const getGuildIssuerPublicKey = async (
  guildId: string,
  kid?: string,
  now: Date = new Date(),
): Promise<string> => {
  const lookup = await qrAccessIssuerRegistry.lookupIssuerKey(
    guildId,
    kid !== undefined ? { kind: "kid", kid } : null,
    now,
  );

  switch (lookup.status) {
    case "active":
      return lookup.keyMaterial;

    case "revoked":
      throw new QrSignatureError(
        QR_SIGNATURE_ERROR_CODES.REVOKED_KEY,
        `QR code was signed with a revoked key (kid: ${
          lookup.ref.kind === "kid" ? lookup.ref.kid : lookup.ref.address
        }).`,
      );

    case "unknown":
      throw new QrSignatureError(
        QR_SIGNATURE_ERROR_CODES.UNKNOWN_KEY,
        `QR code was signed with an unknown or unrecognized key ID (kid: ${
          lookup.ref.kind === "kid" ? lookup.ref.kid : lookup.ref.address
        }).`,
      );

    case "unavailable":
      throw new QrSignatureError(
        UNAVAILABLE_REASON_TO_QR_CODE[lookup.reason],
        lookup.detail ?? "Guild issuer public key is unavailable.",
      );
  }
};

/**
 * The QR access credential path as a `CredentialIssuerRegistry`.
 *
 * Registered for discovery by `registerBuiltInIssuers()`. The live verification
 * path does not read it from the global registry — `getGuildIssuerPublicKey()`
 * above holds the logic directly.
 */
export const qrAccessIssuerRegistry: CredentialIssuerRegistry = {
  credentialKind: "qr_access",

  async lookupIssuerKey(guildId, ref, now = new Date()) {
    return lookupGuildIssuerKey(guildId, ref, now);
  },

  async isRevoked(guildId, ref, now = new Date()) {
    const resolution = await resolveGuildKeyRegistry(guildId, now);
    if (!resolution.ok) {
      // Registry unavailable — status indeterminate, fail closed.
      return null;
    }
    if (ref.kind !== "kid") {
      // This path revokes by key id; an address reference is not answerable.
      return null;
    }
    return resolution.registry.revokedKids.has(ref.kid.trim());
  },
};
