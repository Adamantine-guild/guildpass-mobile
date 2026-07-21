/**
 * Issuer key registry and storage
 * Maintains the mapping of guild IDs to their on-chain-registered issuer public keys
 * Cached locally for offline verification
 */

import { type GuildIssuerKey, ATTESTATION_STORAGE_KEYS } from './types';
import { migratingSecureStorage } from '../../lib/storage';

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
  maxCacheAgeDays: number = 7
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
        JSON.stringify(guildIds)
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
    console.warn('Failed to retrieve all cached issuer keys:', error);
    return [];
  }
}

/**
 * Clear all issuer key cache
 */
export async function clearIssuerKeyCache(): Promise<void> {
  try {
    const index = await migratingSecureStorage.getItem(ATTESTATION_STORAGE_KEYS.ISSUER_KEYS_INDEX);
    const guildIds = index ? (JSON.parse(index) as string[]) : [];

    const keys = guildIds.map((guildId) => `${ATTESTATION_STORAGE_KEYS.ISSUER_KEYS}${guildId}`);
    keys.push(ATTESTATION_STORAGE_KEYS.ISSUER_KEYS_INDEX);

    await Promise.all(keys.map((key) => migratingSecureStorage.removeItem(key)));
  } catch (error) {
    console.error('Failed to clear issuer key cache:', error);
    throw error;
  }
}
