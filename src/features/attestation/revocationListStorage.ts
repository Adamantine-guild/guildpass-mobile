/**
 * Secure storage for revocation lists
 */

import { sha256, toHex } from "viem";
import { migratingSecureStorage } from "../../lib/storage";
import type {
  RevocationList,
  CachedRevocationList,
  SerializedRevocationList,
  RevocationSyncStatus,
  REVOCATION_STORAGE_KEYS,
} from "./revocationList.types";
import { RevocationListError, REVOCATION_ERROR_CODES } from "./revocationList.types";

function generateContentHash(list: RevocationList): string {
  const payload = {
    guildId: list.guildId,
    version: list.version,
    issuedAt: list.issuedAt,
    expiresAt: list.expiresAt,
    revokedKeys: [...list.revokedKeys].sort((a, b) => {
      const addr = a.address.localeCompare(b.address);
      if (addr !== 0) return addr;
      return (a.keyId || '').localeCompare(b.keyId || '');
    }),
  };
  return sha256(toHex(JSON.stringify(payload)));
}

function generateChecksum(data: Omit<SerializedRevocationList, 'checksum'>): string {
  return sha256(toHex(JSON.stringify(data)));
}

function serializeRevocationList(cached: CachedRevocationList): string {
  const data: Omit<SerializedRevocationList, 'checksum'> = {
    version: 1,
    guildId: cached.list.guildId,
    listVersion: cached.list.version,
    issuedAt: cached.list.issuedAt,
    expiresAt: cached.list.expiresAt,
    revokedKeys: cached.list.revokedKeys,
    signature: cached.list.signature,
    cachedAt: cached.cachedAt,
    contentHash: cached.contentHash,
    signatureVerified: cached.signatureVerified,
  };
  const serialized: SerializedRevocationList = { ...data, checksum: generateChecksum(data) };
  return JSON.stringify(serialized);
}

function deserializeRevocationList(raw: string, expectedGuildId: string): CachedRevocationList | null {
  try {
    const parsed = JSON.parse(raw) as Partial<SerializedRevocationList>;

    if (
      parsed.version !== 1 ||
      typeof parsed.guildId !== 'string' || parsed.guildId !== expectedGuildId ||
      typeof parsed.listVersion !== 'number' ||
      typeof parsed.issuedAt !== 'number' ||
      typeof parsed.expiresAt !== 'number' ||
      !Array.isArray(parsed.revokedKeys) ||
      typeof parsed.signature !== 'string' ||
      typeof parsed.cachedAt !== 'number' ||
      typeof parsed.contentHash !== 'string' ||
      typeof parsed.signatureVerified !== 'boolean' ||
      typeof parsed.checksum !== 'string'
    ) {
      return null;
    }

    const { checksum, ...data } = parsed as SerializedRevocationList;
    if (generateChecksum(data) !== checksum) {
      console.warn(`Checksum mismatch for ${expectedGuildId}`);
      return null;
    }

    const list: RevocationList = {
      guildId: parsed.guildId,
      version: parsed.listVersion,
      issuedAt: parsed.issuedAt,
      expiresAt: parsed.expiresAt,
      revokedKeys: parsed.revokedKeys,
      signature: parsed.signature,
    };

    if (generateContentHash(list) !== parsed.contentHash) {
      return null;
    }

    return {
      list,
      cachedAt: parsed.cachedAt,
      contentHash: parsed.contentHash,
      signatureVerified: parsed.signatureVerified,
    };
  } catch {
    return null;
  }
}

export async function storeRevocationList(
  guildId: string,
  list: RevocationList,
  signatureVerified: boolean = false
): Promise<void> {
  const cached: CachedRevocationList = {
    list,
    cachedAt: Date.now(),
    contentHash: generateContentHash(list),
    signatureVerified,
  };

  try {
    const storageKey = `${REVOCATION_STORAGE_KEYS.REVOCATION_LIST}${guildId}`;
    await migratingSecureStorage.setItem(storageKey, serializeRevocationList(cached));
    await updateRevocationIndex(guildId, true);
    console.log(`Stored revocation list for ${guildId}, version ${list.version}`);
  } catch (error) {
    throw new RevocationListError(
      REVOCATION_ERROR_CODES.CORRUPTED_DATA,
      `Failed to store revocation list for ${guildId}`,
      { guildId, error: String(error) }
    );
  }
}

export async function loadRevocationList(guildId: string): Promise<CachedRevocationList | null> {
  try {
    const storageKey = `${REVOCATION_STORAGE_KEYS.REVOCATION_LIST}${guildId}`;
    const raw = await migratingSecureStorage.getItem(storageKey);
    if (!raw) return null;

    const cached = deserializeRevocationList(raw, guildId);
    if (!cached) {
      await removingSecureStorage.removeItem(storageKey);
      await updateRevocationIndex(guildId, false);
      return null;
    }
    return cached;
  } catch (error) {
    console.warn(`Failed to load revocation list for ${guildId}:`, error);
    return null;
  }
}

export async function removeRevocationList(guildId: string): Promise<void> {
  try {
    const storageKey = `${REVOCATION_STORAGE_KEYS.REVOCATION_LIST}${guildId}`;
    await migratingSecureStorage.removeItem(storageKey);
    await updateRevocationIndex(guildId, false);
  } catch (error) {
    console.warn(`Failed to remove revocation list for ${guildId}:`, error);
  }
}

async function updateRevocationIndex(guildId: string, add: boolean): Promise<void> {
  try {
    const raw = await migratingSecureStorage.getItem(REVOCATION_STORAGE_KEYS.REVOCATION_INDEX);
    const index: string[] = raw ? JSON.parse(raw) : [];
    
    if (add && !index.includes(guildId)) {
      index.push(guildId);
    } else if (!add) {
      const idx = index.indexOf(guildId);
      if (idx !== -1) index.splice(idx, 1);
    }

    await migratingSecureStorage.setItem(REVOCATION_STORAGE_KEYS.REVOCATION_INDEX, JSON.stringify(index));
  } catch (error) {
    console.warn('Failed to update revocation index:', error);
  }
}

export async function clearRevocationStorage(): Promise<void> {
  try {
    const guilds = await getAllCachedGuilds();
    const removePromises = guilds.map(async (gid) => {
      const listKey = `${REVOCATION_STORAGE_KEYS.REVOCATION_LIST}${gid}`;
      const syncKey = `${REVOCATION_STORAGE_KEYS.SYNC_STATUS}${gid}`;
      await Promise.all([
        migratingSecureStorage.removeItem(listKey),
        migratingSecureStorage.removeItem(syncKey),
      ]);
    });
    await Promise.all([...removePromises, migratingSecureStorage.removeItem(REVOCATION_STORAGE_KEYS.REVOCATION_INDEX)]);
  } catch (error) {
    console.error('Failed to clear revocation storage:', error);
  }
}

async function getAllCachedGuilds(): Promise<string[]> {
  try {
    const raw = await migratingSecureStorage.getItem(REVOCATION_STORAGE_KEYS.REVOCATION_INDEX);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}