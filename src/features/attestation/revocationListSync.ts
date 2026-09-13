/**
 * Revocation list sync service
 */

import type { RevocationList, RevocationSyncStatus } from "./revocationList.types";
import { RevocationListError, REVOCATION_ERROR_CODES } from "./revocationList.types";
import { setCachedRevocationList } from "./revocationListCache";
import { validateRevocationList } from "./revocationListVerifier";
import { guildPassClient } from "../../lib/guildpassClient";

export type FetchRevocationListFn = (guildId: string) => Promise<RevocationList>;
export type FetchAuthorityAddressFn = (guildId: string) => Promise<string>;

export interface RevocationSyncConfig {
  fetchRevocationList: FetchRevocationListFn;
  fetchAuthorityAddress: FetchAuthorityAddressFn;
  maxConcurrentSyncs: number;
  syncTimeoutMs: number;
  enableAutoSync: boolean;
  autoSyncIntervalMs: number;
}

const DEFAULT_SYNC_CONFIG: RevocationSyncConfig = {
  fetchRevocationList: async (guildId: string) => {
    const response = await guildPassClient.guilds.getGuildConfig({ guildId });
    return extractRevocationListFromConfig(response, guildId);
  },
  fetchAuthorityAddress: async (guildId: string) => {
    const config = await guildPassClient.guilds.getGuildConfig({ guildId });
    return config.revocationAuthority || config.issuerAddress || config.ownerAddress;
  },
  maxConcurrentSyncs: 3,
  syncTimeoutMs: 30000,
  enableAutoSync: true,
  autoSyncIntervalMs: 5 * 60 * 1000,
};

function extractRevocationListFromConfig(config: any, guildId: string): RevocationList {
  const revocationData = config.revocationList || config.attestationRevocationList;
  
  if (!revocationData) {
    return {
      guildId,
      version: 1,
      issuedAt: Date.now(),
      expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
      revokedKeys: [],
      signature: '0x',
    };
  }

  if (typeof revocationData === 'object' && revocationData.guildId === guildId) {
    return revocationData as RevocationList;
  }

  throw new RevocationListError(
    REVOCATION_ERROR_CODES.CORRUPTED_DATA,
    'Invalid revocation list format in guild config'
  );
}

export class RevocationListSyncService {
  private config: RevocationSyncConfig;
  private activeSyncs = new Map<string, Promise<void>>();
  private autoSyncInterval: NodeJS.Timeout | null = null;

  constructor(config?: Partial<RevocationSyncConfig>) {
    this.config = { ...DEFAULT_SYNC_CONFIG, ...config };
  }

  async syncGuild(guildId: string, force: boolean = false): Promise<{
    success: boolean;
    updated: boolean;
    version?: number;
    error?: string;
  }> {
    if (this.activeSyncs.has(guildId)) {
      await this.activeSyncs.get(guildId);
      return { success: true, updated: false };
    }

    const syncPromise = this.performGuildSync(guildId, force);
    this.activeSyncs.set(guildId, syncPromise);

    try {
      return await syncPromise;
    } finally {
      this.activeSyncs.delete(guildId);
    }
  }

  private async performGuildSync(guildId: string, force: boolean): Promise<{
    success: boolean;
    updated: boolean;
    version?: number;
    error?: string;
  }> {
    const startTime = Date.now();
    
    try {
      const cached = await getCachedRevocationList(guildId);
      const currentVersion = cached?.list.version;

      const freshList = await Promise.race([
        this.config.fetchRevocationList(guildId),
        new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error('Sync timeout')), this.config.syncTimeoutMs)
        )
      ]);

      if (!force && currentVersion !== undefined && freshList.version <= currentVersion) {
        return { success: true, updated: false, version: currentVersion };
      }

      const authorityAddress = await this.config.fetchAuthorityAddress(guildId);

      const validation = await validateRevocationList(freshList, authorityAddress, currentVersion);
      if (!validation.valid) {
        return { success: false, updated: false, error: `Invalid revocation list: ${validation.reason}` };
      }

      await setCachedRevocationList(guildId, freshList, authorityAddress);

      console.log(`Synced revocation list for ${guildId}, version ${freshList.version}`);
      return { success: true, updated: true, version: freshList.version };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.warn(`Failed to sync revocation list for ${guildId}:`, error);
      return { success: false, updated: false, error: errorMessage };
    }
  }

  async syncGuilds(guildIds: string[], force: boolean = false): Promise<{
    total: number;
    successful: number;
    updated: number;
    failed: string[];
  }> {
    const results = {
      total: guildIds.length,
      successful: 0,
      updated: 0,
      failed: [] as string[],
    };

    const batches = [];
    for (let i = 0; i < guildIds.length; i += this.config.maxConcurrentSyncs) {
      batches.push(guildIds.slice(i, i + this.config.maxConcurrentSyncs));
    }

    for (const batch of batches) {
      const promises = batch.map(async (guildId) => {
        try {
          const result = await this.syncGuild(guildId, force);
          if (result.success) {
            results.successful++;
            if (result.updated) results.updated++;
          } else {
            results.failed.push(guildId);
          }
        } catch (error) {
          results.failed.push(guildId);
        }
      });

      await Promise.all(promises);
    }

    return results;
  }

  startAutoSync(guildIds: string[]): void {
    if (!this.config.enableAutoSync || this.autoSyncInterval !== null) return;

    this.autoSyncInterval = setInterval(async () => {
      try {
        console.log('Starting automatic revocation list sync...');
        const results = await this.syncGuilds(guildIds);
        console.log(`Auto-sync completed: ${results.successful}/${results.total} successful`);
        if (results.failed.length > 0) {
          console.warn(`Auto-sync failed for: ${results.failed.join(', ')}`);
        }
      } catch (error) {
        console.error('Auto-sync error:', error);
      }
    }, this.config.autoSyncIntervalMs);
  }

  stopAutoSync(): void {
    if (this.autoSyncInterval) {
      clearInterval(this.autoSyncInterval);
      this.autoSyncInterval = null;
    }
  }

  cancelAllSyncs(): void {
    this.activeSyncs.clear();
  }

  updateConfig(newConfig: Partial<RevocationSyncConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  destroy(): void {
    this.stopAutoSync();
    this.cancelAllSyncs();
  }
}

let globalSyncService: RevocationListSyncService | null = null;

export function getRevocationSyncService(config?: Partial<RevocationSyncConfig>): RevocationListSyncService {
  if (!globalSyncService) {
    globalSyncService = new RevocationListSyncService(config);
  } else if (config) {
    globalSyncService.updateConfig(config);
  }
  return globalSyncService;
}

export function initializeRevocationSync(config?: Partial<RevocationSyncConfig>): RevocationListSyncService {
  globalSyncService = new RevocationListSyncService(config);
  return globalSyncService;
}

export async function syncRevocationList(guildId: string, force?: boolean) {
  return getRevocationSyncService().syncGuild(guildId, force);
}

export async function syncRevocationLists(guildIds: string[], force?: boolean) {
  return getRevocationSyncService().syncGuilds(guildIds, force);
}

export function startRevocationAutoSync(guildIds: string[]) {
  getRevocationSyncService().startAutoSync(guildIds);
}

export function stopRevocationAutoSync() {
  getRevocationSyncService().stopAutoSync();
}