import { guildPassClient } from "../../lib/guildpassClient";
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
      registryCache.set(guildId, freshRegistry);
      return freshRegistry;
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

  // No cached entry: must fetch online
  const freshRegistry = await fetchGuildKeyRegistry(guildId, now);
  registryCache.set(guildId, freshRegistry);
  return freshRegistry;
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
