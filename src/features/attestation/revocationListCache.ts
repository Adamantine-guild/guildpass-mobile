/**
 * Revocation list cache management
 */

import type { RevocationList, CachedRevocationList, RevocationCheckResult, RevocationCacheConfig } from "./revocationList.types";
import { REVOCATION_DEFAULTS } from "./revocationList.types";
import { storeRevocationList, loadRevocationList, removeRevocationList } from "./revocationListStorage";
import { migratingSecureStorage } from "../../lib/storage";
import { validateRevocationList, checkKeyRevocationStatus, isCacheFresh, isWithinTrustWindow } from "./revocationListVerifier";

class RevocationListCache {
  private cache = new Map<string, CachedRevocationList>();
  private config: RevocationCacheConfig;

  constructor(config?: Partial<RevocationCacheConfig>) {
    this.config = {
      cacheTtlMs: config?.cacheTtlMs ?? REVOCATION_DEFAULTS.CACHE_TTL_MS,
      offlineTrustWindowMs: config?.offlineTrustWindowMs ?? REVOCATION_DEFAULTS.OFFLINE_TRUST_WINDOW_MS,
      maxListSize: config?.maxListSize ?? REVOCATION_DEFAULTS.MAX_LIST_SIZE,
      failClosed: config?.failClosed ?? REVOCATION_DEFAULTS.FAIL_CLOSED,
    };
  }

  async getCachedList(guildId: string): Promise<CachedRevocationList | null> {
    let cached = this.cache.get(guildId);
    
    if (cached) {
      const now = Date.now();
      if (isCacheFresh(cached.cachedAt, now, this.config.cacheTtlMs)) {
        return cached;
      }
      if (isWithinTrustWindow(cached.cachedAt, now, this.config.offlineTrustWindowMs)) {
        return cached;
      }
      this.cache.delete(guildId);
    }

    cached = await loadRevocationList(guildId);
    if (cached) {
      const now = Date.now();
      if (isWithinTrustWindow(cached.cachedAt, now, this.config.offlineTrustWindowMs)) {
        this.cache.set(guildId, cached);
        return cached;
      }
      await removeRevocationList(guildId);
    }

    return null;
  }

  async setCachedList(
    guildId: string,
    list: RevocationList,
    authorityAddress: string
  ): Promise<void> {
    const current = await this.getCachedList(guildId);
    const currentVersion = current?.list.version;

    const validation = await validateRevocationList(list, authorityAddress, currentVersion, this.config.maxListSize);
    if (!validation.valid) {
      throw new Error(`Invalid revocation list: ${validation.reason}`);
    }

    const cached: CachedRevocationList = {
      list,
      cachedAt: Date.now(),
      contentHash: '',
      signatureVerified: true,
    };

    this.cache.set(guildId, cached);
    await storeRevocationList(guildId, list, true);
  }

  async removeCachedList(guildId: string): Promise<void> {
    this.cache.delete(guildId);
    await removeRevocationList(guildId);
  }

  async checkRevocationStatus(
    guildId: string,
    keyAddress?: string,
    keyId?: string,
    networkAvailable: boolean = true
  ): Promise<RevocationCheckResult> {
    const context: any = {
      guildId,
      now: Date.now(),
      networkAvailable,
      config: this.config,
    };

    const cached = await this.getCachedList(guildId);
    
    if (!cached) {
      return {
        status: 'unavailable',
        reason: 'No revocation data for guild',
        failClosed: this.config.failClosed,
      };
    }

    return checkKeyRevocationStatus(cached, context, keyAddress, keyId);
  }

  async clearCache(): Promise<void> {
    this.cache.clear();
    const guilds = await getAllCachedGuilds();
    await Promise.all(guilds.map(guildId => removeRevocationList(guildId)));
  }

  async cleanupExpired(): Promise<{ removed: number }> {
    const now = Date.now();
    let removed = 0;

    for (const [guildId, cached] of this.cache.entries()) {
      if (!isWithinTrustWindow(cached.cachedAt, now, this.config.offlineTrustWindowMs)) {
        this.cache.delete(guildId);
        removed++;
      }
    }

    const guilds = await getAllCachedGuilds();
    await Promise.all(
      guilds.map(async (guildId) => {
        const cached = await loadRevocationList(guildId);
        if (cached && !isWithinTrustWindow(cached.cachedAt, now, this.config.offlineTrustWindowMs)) {
          await removeRevocationList(guildId);
          removed++;
        }
      })
    );

    return { removed };
  }

  updateConfig(newConfig: Partial<RevocationCacheConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  getConfig(): RevocationCacheConfig {
    return { ...this.config };
  }
}

async function getAllCachedGuilds(): Promise<string[]> {
  try {
    const raw = await migratingSecureStorage.getItem('guildpass:revocation-list-index:v1');
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

let globalCache: RevocationListCache | null = null;

export function getRevocationCache(config?: Partial<RevocationCacheConfig>): RevocationListCache {
  if (!globalCache) {
    globalCache = new RevocationListCache(config);
  } else if (config) {
    globalCache.updateConfig(config);
  }
  return globalCache;
}

export function initializeRevocationCache(config?: Partial<RevocationCacheConfig>): RevocationListCache {
  globalCache = new RevocationListCache(config);
  return globalCache;
}

export async function getCachedRevocationList(guildId: string): Promise<CachedRevocationList | null> {
  return getRevocationCache().getCachedList(guildId);
}

export async function setCachedRevocationList(
  guildId: string,
  list: RevocationList,
  authorityAddress: string
): Promise<void> {
  return getRevocationCache().setCachedList(guildId, list, authorityAddress);
}

export async function checkRevocationStatus(
  guildId: string,
  keyAddress?: string,
  keyId?: string,
  networkAvailable: boolean = true
): Promise<RevocationCheckResult> {
  return getRevocationCache().checkRevocationStatus(guildId, keyAddress, keyId, networkAvailable);
}

export async function clearRevocationCache(): Promise<void> {
  return getRevocationCache().clearCache();
}

export async function cleanupExpiredRevocationCache(): Promise<{ removed: number }> {
  return getRevocationCache().cleanupExpired();
}