/**
 * Issuer key registry and storage
 * Maintains the mapping of guild IDs to their on-chain-registered issuer public keys
 * Cached locally for offline verification
 *
 * Revocation model
 * ----------------
 * Mirrors the QR credential path's approach (see src/features/access/guildIssuerKey.ts):
 * issuer addresses that have been revoked are cached in an in-memory registry with a
 * bounded TTL and an offline trust window.  The check is address-based: the verifier
 * looks up the issuer address against the set of revoked addresses for the guild.
 *
 * Offline policy: FAIL CLOSED
 * ----------------------------
 * If revocation data is unavailable (no cache hit and offline), the check returns
 * `null` and the caller (validateAttestation) rejects the attestation with
 * REVOCATION_DATA_UNAVAILABLE.  This is the deliberatively chosen conservative
 * default: portable attestations that remain valid for months demand that an
 * offline verifier who cannot confirm the key's continued validity must not
 * accept a proof that might have been signed by a compromised key.
 */

import {
  type GuildIssuerKey,
  type AttestationKeyRegistry,
  type SerializedAttestationKeyRegistry,
  ATTESTATION_STORAGE_KEYS,
} from "./types";
import { migratingSecureStorage } from "../../lib/storage";

// ──────────────────────────────────────────────
//  In-memory revocation registry cache
// ──────────────────────────────────────────────

const revocationRegistryCache = new Map<string, AttestationKeyRegistry>();

/** Default bounded TTL for revocation registry cache: 15 minutes */
export const ATTESTATION_REVOCATION_CACHE_TTL_MS = 15 * 60 * 1000;

/**
 * Default offline trust window for cached revocation registry fallback.
 * After this period without connectivity the verifier refuses attestations
 * whose key status it cannot confirm.
 */
export const ATTESTATION_REVOCATION_OFFLINE_TRUST_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Freshness policies for the two cache tiers.
 *
 * The boundaries differ and that is deliberate: the in-memory tier has always
 * treated the trust window as inclusive (`age <= window`), while the persisted
 * tier has treated it as exclusive (`age < window`). The difference is one
 * millisecond wide. It is preserved rather than unified because narrowing or
 * widening when a verifier stops accepting attestations offline is a security
 * behaviour change, not a refactor.
 */
const MEMORY_FRESHNESS_POLICY: FreshnessPolicy = {
  ttlMs: ATTESTATION_REVOCATION_CACHE_TTL_MS,
  offlineTrustWindowMs: ATTESTATION_REVOCATION_OFFLINE_TRUST_WINDOW_MS,
  trustWindowBoundary: 'inclusive',
};

const PERSISTED_FRESHNESS_POLICY: FreshnessPolicy = {
  ttlMs: ATTESTATION_REVOCATION_CACHE_TTL_MS,
  offlineTrustWindowMs: ATTESTATION_REVOCATION_OFFLINE_TRUST_WINDOW_MS,
  trustWindowBoundary: 'exclusive',
};

/** Storage key prefix for cached revocation registries */
const REVOCATION_STORAGE_PREFIX = ATTESTATION_STORAGE_KEYS.ATTESTATION_KEY_REGISTRY;
const REVOCATION_INDEX_KEY = ATTESTATION_STORAGE_KEYS.ATTESTATION_KEY_REGISTRY_INDEX;

// ══════════════════════════════════════════════
//  Public API
// ══════════════════════════════════════════════

/**
 * Check whether an issuer address has been revoked for a given guild.
 *
 * Returns one of three outcomes:
 *  - `false`          – the address is definitively NOT revoked (confirmed via cache)
 *  - `true`           – the address IS revoked
 *  - `null`           – revocation status could not be determined (offline, no cached data)
 *
 * _fail-closed policy_: the caller should treat `null` as a rejection.
 *
 * @param guildId       The guild to query.
 * @param issuerAddress The issuer address to check.
 * @param now           Timestamp for cache-age computations (defaults to Date.now()).
 */
export async function checkIssuerKeyRevoked(
  guildId: string,
  issuerAddress: `0x${string}`,
  now: Date = new Date(),
): Promise<boolean | null> {
  // Calls the module-local registry object directly, never the global credential
  // registry: this gates access, so it must not depend on bootstrap ordering.
  return attestationIssuerRegistry.isRevoked(guildId, { kind: 'address', address: issuerAddress }, now);
}

/**
 * Persist an updated revocation registry (e.g. after a fresh backend fetch).
 * Replaces any previously cached data for the guild.
 */
export async function cacheAttestationRevocationRegistry(
  guildId: string,
  revokedAddresses: Set<string>,
  fetchedAt?: number,
): Promise<void> {
  const now = fetchedAt ?? Date.now();
  const registry: AttestationKeyRegistry = { guildId, revokedAddresses, fetchedAt: now };

  // Update in-memory cache
  revocationRegistryCache.set(guildId, registry);

  // Persist to secure storage
  try {
    const serialized: SerializedAttestationKeyRegistry = {
      guildId,
      revokedAddresses: Array.from(revokedAddresses),
      fetchedAt: now,
    };
    await migratingSecureStorage.setItem(
      `${REVOCATION_STORAGE_PREFIX}${guildId}`,
      JSON.stringify(serialized),
    );

    // Update index
    const indexRaw = await migratingSecureStorage.getItem(REVOCATION_INDEX_KEY);
    const index: string[] = indexRaw ? (JSON.parse(indexRaw) as string[]) : [];
    if (!index.includes(guildId)) {
      index.push(guildId);
      await migratingSecureStorage.setItem(REVOCATION_INDEX_KEY, JSON.stringify(index));
    }
  } catch (error) {
    console.warn(`Failed to persist revocation registry for guild ${guildId}:`, error);
  }
}

/**
 * Clear the revocation registry cache (both in-memory and persisted).
 */
export async function clearAttestationRevocationCache(): Promise<void> {
  revocationRegistryCache.clear();
  try {
    const indexRaw = await migratingSecureStorage.getItem(REVOCATION_INDEX_KEY);
    const index: string[] = indexRaw ? (JSON.parse(indexRaw) as string[]) : [];
    const keys = index.map((gid) => `${REVOCATION_STORAGE_PREFIX}${gid}`);
    keys.push(REVOCATION_INDEX_KEY);
    await Promise.all(keys.map((k) => migratingSecureStorage.removeItem(k)));
  } catch (error) {
    console.warn("Failed to clear persisted revocation cache:", error);
  }
}

// ══════════════════════════════════════════════
//  Internal helpers
// ══════════════════════════════════════════════

/**
 * Resolve the revocation registry for a guild, using in-memory cache,
 * persisted cache, or returning `null` if unavailable (fail-closed).
 */
async function getAttestationRevocationRegistry(
  guildId: string,
  now: Date,
): Promise<AttestationKeyRegistry | null> {
  const nowMs = now.getTime();

  // 1. Check in-memory cache first
  const cached = revocationRegistryCache.get(guildId);
  if (cached !== undefined) {
    // Fresh, or past TTL but still inside the offline trust window — either way
    // the cached data is usable. A fresh fetch is the caller's responsibility;
    // this path never reaches the network.
    if (classifyRegistryFreshness(cached.fetchedAt, nowMs, MEMORY_FRESHNESS_POLICY) !== 'expired') {
      return cached;
    }
    // Past the offline trust window — cache is too stale to trust.
    revocationRegistryCache.delete(guildId);
    // Fall through to check persisted storage
  }

  // 2. Try to hydrate from secure storage (persisted cache)
  const persisted = await loadPersistedRevocationRegistry(guildId);
  if (persisted !== null) {
    if (
      classifyRegistryFreshness(persisted.fetchedAt, nowMs, PERSISTED_FRESHNESS_POLICY) !== 'expired'
    ) {
      // Persisted data is within trust window — hydrate in-memory and return
      revocationRegistryCache.set(guildId, persisted);
      return persisted;
    }
    // Persisted data is too old — delete it
    await migratingSecureStorage.removeItem(`${REVOCATION_STORAGE_PREFIX}${guildId}`);
  }

  // 3. No usable cached data at all — fail closed
  return null;
}

/**
 * Load a persisted revocation registry from secure storage.
 */
async function loadPersistedRevocationRegistry(
  guildId: string,
): Promise<AttestationKeyRegistry | null> {
  try {
    const raw = await migratingSecureStorage.getItem(`${REVOCATION_STORAGE_PREFIX}${guildId}`);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as SerializedAttestationKeyRegistry;
    return {
      guildId: parsed.guildId,
      revokedAddresses: new Set(parsed.revokedAddresses.map((a) => a.toLowerCase())),
      fetchedAt: parsed.fetchedAt,
    };
  } catch {
    return null;
  }
}

// ══════════════════════════════════════════════
//  Original issuer-key CRUD (unchanged below)
// ══════════════════════════════════════════════

/**
 * Get the cached issuer key for a guild
 * Returns null if not cached or cache is stale
 *
 * @param guildId The guild ID
 * @param maxCacheAgeDays Maximum age of cached key in days (default: 7)
 * @returns The cached issuer key or null
 */
export async function getCachedIssuerKey(
  guildId: string,
  maxCacheAgeDays: number = 7,
): Promise<GuildIssuerKey | null> {
  try {
    const key = `${ATTESTATION_STORAGE_KEYS.ISSUER_KEYS}${guildId}`;
    const stored = await migratingSecureStorage.getItem(key);

    if (!stored) {
      return null;
    }

    const issuerKey = JSON.parse(stored) as GuildIssuerKey;
    const ageMs = Date.now() - issuerKey.cachedAt;
    const ageDays = ageMs / (1000 * 60 * 60 * 24);

    if (ageDays > maxCacheAgeDays) {
      // Cache is stale, remove it
      await migratingSecureStorage.removeItem(key);
      return null;
    }

    return issuerKey;
  } catch (error) {
    console.warn(`Failed to retrieve cached issuer key for guild ${guildId}:`, error);
    return null;
  }
}

/**
 * Cache an issuer key locally
 *
 * @param issuerKey The issuer key to cache
 */
export async function cacheIssuerKey(issuerKey: GuildIssuerKey): Promise<void> {
  try {
    const key = `${ATTESTATION_STORAGE_KEYS.ISSUER_KEYS}${issuerKey.guildId}`;
    await migratingSecureStorage.setItem(key, JSON.stringify(issuerKey));

    // Add to index
    const index = await migratingSecureStorage.getItem(ATTESTATION_STORAGE_KEYS.ISSUER_KEYS_INDEX);
    const guildIds = index ? (JSON.parse(index) as string[]) : [];

    if (!guildIds.includes(issuerKey.guildId)) {
      guildIds.push(issuerKey.guildId);
      await migratingSecureStorage.setItem(
        ATTESTATION_STORAGE_KEYS.ISSUER_KEYS_INDEX,
        JSON.stringify(guildIds),
      );
    }
  } catch (error) {
    console.error(`Failed to cache issuer key for guild ${issuerKey.guildId}:`, error);
    throw error;
  }
}

/**
 * Invalidate issuer key cache for a guild
 * Forces refresh from backend on next verification
 *
 * @param guildId The guild ID
 */
export async function invalidateIssuerKeyCache(guildId: string): Promise<void> {
  try {
    const key = `${ATTESTATION_STORAGE_KEYS.ISSUER_KEYS}${guildId}`;
    await migratingSecureStorage.removeItem(key);
  } catch (error) {
    console.warn(`Failed to invalidate issuer key cache for guild ${guildId}:`, error);
  }
}

/**
 * Get all cached issuer keys
 * Useful for monitoring and maintenance
 *
 * @returns Array of all cached issuer keys
 */
export async function getAllCachedIssuerKeys(): Promise<GuildIssuerKey[]> {
  try {
    const index = await migratingSecureStorage.getItem(ATTESTATION_STORAGE_KEYS.ISSUER_KEYS_INDEX);
    const guildIds = index ? (JSON.parse(index) as string[]) : [];

    const issuerKeys: GuildIssuerKey[] = [];

    for (const guildId of guildIds) {
      const key = await getCachedIssuerKey(guildId);
      if (key) {
        issuerKeys.push(key);
      }
    }

    return issuerKeys;
  } catch (error) {
    console.warn("Failed to retrieve all cached issuer keys:", error);
    return [];
  }
}

// ══════════════════════════════════════════════
//  CredentialIssuerRegistry implementation
// ══════════════════════════════════════════════

/**
 * The EIP-712 attestation credential path as a `CredentialIssuerRegistry`.
 *
 * Registered for discovery by `registerBuiltInIssuers()`. `checkIssuerKeyRevoked()`
 * above calls `isRevoked` on this object directly — the live verification path
 * never resolves it through the global registry, so a compromised bootstrap
 * ordering cannot turn a fail-closed rejection into a thrown error.
 *
 * This implementation performs no network I/O, by design. Revocation data arrives
 * via `cacheAttestationRevocationRegistry()` during online verification, which is
 * why `verifySignature.validateAttestation()` can run the revocation check ahead
 * of the far more expensive signature check.
 */
export const attestationIssuerRegistry: CredentialIssuerRegistry = {
  credentialKind: 'eip712_attestation',

  async lookupIssuerKey(
    guildId: string,
    ref: IssuerKeyRef | null,
    now: Date = new Date(),
  ): Promise<IssuerKeyLookup> {
    // Revocation is checked against the *supplied* reference first, mirroring the
    // QR path's ordering. A revoked address must report as revoked even when it is
    // not the guild's currently cached key — "unknown" would understate it.
    if (ref !== null && ref.kind === 'address') {
      const refRevoked = await this.isRevoked(guildId, ref, now);

      if (refRevoked === null) {
        // Indeterminate — fail closed rather than hand back a key that may since
        // have been compromised.
        return {
          status: 'unavailable',
          reason: 'no_registry_data',
          detail: 'Revocation data unavailable for this guild.',
        };
      }

      if (refRevoked) {
        return { status: 'revoked', ref };
      }
    }

    // NOTE: the issuer-key cache carries its own 7-day staleness policy inside
    // getCachedIssuerKey() and measures it against Date.now() rather than `now`.
    // That is a third policy, left as-is; only the revocation tiers were unified.
    const cachedKey = await getCachedIssuerKey(guildId);

    if (cachedKey === null) {
      return {
        status: 'unavailable',
        reason: 'no_registry_data',
        detail: 'Issuer key not cached - requires online fetch',
      };
    }

    if (
      ref !== null &&
      ref.kind === 'address' &&
      ref.address.toLowerCase() !== cachedKey.issuerAddress.toLowerCase()
    ) {
      return { status: 'unknown', ref };
    }

    if (ref === null) {
      // No reference supplied — the cached key is the only candidate, so its own
      // revocation status still has to be confirmed before handing it back.
      const cachedRevoked = await this.isRevoked(
        guildId,
        { kind: 'address', address: cachedKey.issuerAddress },
        now,
      );

      if (cachedRevoked === null) {
        return {
          status: 'unavailable',
          reason: 'no_registry_data',
          detail: 'Revocation data unavailable for this guild.',
        };
      }

      if (cachedRevoked) {
        return { status: 'revoked', ref: { kind: 'address', address: cachedKey.issuerAddress } };
      }
    }

    return { status: 'active', keyMaterial: cachedKey.issuerAddress };
  },

  async isRevoked(
    guildId: string,
    ref: IssuerKeyRef,
    now: Date = new Date(),
  ): Promise<boolean | null> {
    if (ref.kind !== 'address') {
      // This path revokes by issuer address; a kid reference is not answerable.
      return null;
    }

    const registry = await getAttestationRevocationRegistry(guildId, now);
    if (registry === null) {
      // No revocation data available at all — fail closed.
      return null;
    }

    return registry.revokedAddresses.has(ref.address.toLowerCase() as `0x${string}`);
  },
};

/**
 * Clear all issuer key cache
 */
export async function clearIssuerKeyCache(): Promise<void> {
  try {
    const index = await migratingSecureStorage.getItem(ATTESTATION_STORAGE_KEYS.ISSUER_KEYS_INDEX);
    const guildIds = index ? (JSON.parse(index) as string[]) : [];

    const keys = guildIds.map((gid) => `${ATTESTATION_STORAGE_KEYS.ISSUER_KEYS}${gid}`);
    keys.push(ATTESTATION_STORAGE_KEYS.ISSUER_KEYS_INDEX);

    await Promise.all(keys.map((key) => migratingSecureStorage.removeItem(key)));
  } catch (error) {
    console.error("Failed to clear issuer key cache:", error);
    throw error;
  }
}
