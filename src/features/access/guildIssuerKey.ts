import { sha256, toHex } from "viem";
import { guildPassClient } from "../../lib/guildpassClient";
import { migratingSecureStorage } from "../../lib/storage";
import { QrSignatureError, QR_SIGNATURE_ERROR_CODES } from "./qrSignature";

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
  issuerKeys?:
    | Record<string, string>
    | Array<IssuerKeyEntry>;
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

/**
 * Get key registry for a guild, enforcing TTL and offline fallback policy.
 */
export const getGuildKeyRegistry = async (
  guildId: string,
  now: Date = new Date(),
): Promise<GuildKeyRegistry> => {
  const cached = registryCache.get(guildId);
  const nowMs = now.getTime();

  if (cached !== undefined) {
    const age = nowMs - cached.fetchedAt;
    if (age < currentCacheTtlMs) {
      return cached;
    }

    // Cache expired: try to refresh
    try {
      const freshRegistry = await fetchGuildKeyRegistry(guildId, now);
      return cacheRegistry(freshRegistry);
    } catch (error) {
      // Refresh failed (e.g. offline)
      if (age <= currentOfflineTrustWindowMs) {
        // Safe offline fallback: cached registry is still within trust window
        return cached;
      }
      // Past trust window: reject
      throw new QrSignatureError(
        QR_SIGNATURE_ERROR_CODES.KEY_REGISTRY_EXPIRED,
        "Guild key registry cache expired and could not be refreshed offline.",
      );
    }
  }

  const persisted = await loadPersistedRegistry(guildId);
  if (persisted !== null) {
    registryCache.set(guildId, persisted);
    const age = nowMs - persisted.fetchedAt;

    if (age < currentCacheTtlMs) {
      return persisted;
    }

    try {
      const freshRegistry = await fetchGuildKeyRegistry(guildId, now);
      return cacheRegistry(freshRegistry);
    } catch (error) {
      if (age <= currentOfflineTrustWindowMs) {
        return persisted;
      }

      throw new QrSignatureError(
        QR_SIGNATURE_ERROR_CODES.KEY_REGISTRY_EXPIRED,
        "Persisted guild key registry cache expired and could not be refreshed offline.",
      );
    }
  }

  // No memory or persisted entry: must fetch online
  const freshRegistry = await fetchGuildKeyRegistry(guildId, now);
  return cacheRegistry(freshRegistry);
};

/**
 * Resolve the public key for a guild payload by `kid` or legacy fallback.
 * Checks key revocation and unknown key errors.
 */
export const getGuildIssuerPublicKey = async (
  guildId: string,
  kid?: string,
  now: Date = new Date(),
): Promise<string> => {
  const registry = await getGuildKeyRegistry(guildId, now);

  if (kid !== undefined && kid.trim().length > 0) {
    const cleanKid = kid.trim();

    // 1. Check if kid is revoked
    if (registry.revokedKids.has(cleanKid)) {
      throw new QrSignatureError(
        QR_SIGNATURE_ERROR_CODES.REVOKED_KEY,
        `QR code was signed with a revoked key (kid: ${cleanKid}).`,
      );
    }

    // 2. Look up public key for kid
    const pubKey = registry.keys.get(cleanKid);
    if (pubKey !== undefined) {
      return pubKey;
    }

    // 3. Kid not found in active keys
    throw new QrSignatureError(
      QR_SIGNATURE_ERROR_CODES.UNKNOWN_KEY,
      `QR code was signed with an unknown or unrecognized key ID (kid: ${cleanKid}).`,
    );
  }

  // Kid is omitted: check legacy / single-key fallbacks
  if (registry.legacyPublicKey !== undefined) {
    return registry.legacyPublicKey;
  }

  if (registry.keys.size === 1) {
    return registry.keys.values().next().value!;
  }

  if (registry.keys.size > 1) {
    throw new QrSignatureError(
      QR_SIGNATURE_ERROR_CODES.MISSING_KID,
      "QR code is missing a key ID (kid) required to select among multiple active issuer keys.",
    );
  }

  throw new QrSignatureError(
    QR_SIGNATURE_ERROR_CODES.PUBLIC_KEY_UNAVAILABLE,
    "Guild config does not publish a usable issuer public key.",
  );
};
