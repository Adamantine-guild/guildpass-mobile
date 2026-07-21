/**
 * Attestation storage and caching layer
 * Manages persistent storage of attestations for offline verification
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { type CachedAttestation, type RoleAttestation, ATTESTATION_STORAGE_KEYS } from './types';
import { migratingSecureStorage } from '../../lib/storage';

type AttestationIndexEntry = { guildId: string; roleId: string };

const ATTESTATION_WALLET_INDEX_KEY = `${ATTESTATION_STORAGE_KEYS.ATTESTATION_INDEX}:wallets`;

function getAttestationIndexKey(walletAddress: string): string {
  return `${ATTESTATION_STORAGE_KEYS.ATTESTATION_INDEX}${walletAddress}`;
}

async function getAttestationIndex(walletAddress: string): Promise<AttestationIndexEntry[]> {
  const index = await migratingSecureStorage.getItem(getAttestationIndexKey(walletAddress));
  return index ? (JSON.parse(index) as AttestationIndexEntry[]) : [];
}

async function getAttestationWalletIndex(): Promise<string[]> {
  const index = await migratingSecureStorage.getItem(ATTESTATION_WALLET_INDEX_KEY);
  return index ? (JSON.parse(index) as string[]) : [];
}

async function registerAttestationWallet(walletAddress: string): Promise<void> {
  const wallets = await getAttestationWalletIndex();
  const normalized = walletAddress.toLowerCase();
  if (!wallets.includes(normalized)) {
    await migratingSecureStorage.setItem(
      ATTESTATION_WALLET_INDEX_KEY,
      JSON.stringify([...wallets, normalized])
    );
  }
}

async function unregisterAttestationWallet(walletAddress: string): Promise<void> {
  const wallets = await getAttestationWalletIndex();
  const normalized = walletAddress.toLowerCase();
  const filtered = wallets.filter((wallet) => wallet !== normalized);
  if (filtered.length === 0) {
    await migratingSecureStorage.removeItem(ATTESTATION_WALLET_INDEX_KEY);
  } else if (filtered.length !== wallets.length) {
    await migratingSecureStorage.setItem(ATTESTATION_WALLET_INDEX_KEY, JSON.stringify(filtered));
  }
}

/**
 * Create a unique storage key for an attestation
 */
function getAttestationStorageKey(
  walletAddress: string,
  guildId: string,
  roleId: string
): string {
  return `${ATTESTATION_STORAGE_KEYS.ATTESTATIONS}${walletAddress}:${guildId}:${roleId}`;
}

/**
 * Cache an attestation locally
 *
 * @param walletAddress The wallet address
 * @param attestation The attestation to cache
 */
export async function cacheAttestation(
  walletAddress: string,
  attestation: RoleAttestation
): Promise<void> {
  try {
    const key = getAttestationStorageKey(walletAddress, attestation.guildId, attestation.roleId);
    const cached: CachedAttestation = {
      ...attestation,
      cachedAt: Date.now(),
    };

    await migratingSecureStorage.setItem(key, JSON.stringify(cached));

    // Add to index
    const indexKey = getAttestationIndexKey(walletAddress);
    const entries = await getAttestationIndex(walletAddress);

    const exists = entries.some(
      (e) => e.guildId === attestation.guildId && e.roleId === attestation.roleId
    );

    if (!exists) {
      entries.push({
        guildId: attestation.guildId,
        roleId: attestation.roleId,
      });
      await migratingSecureStorage.setItem(indexKey, JSON.stringify(entries));
    }
    await registerAttestationWallet(walletAddress);
  } catch (error) {
    console.error(
      `Failed to cache attestation for ${walletAddress} in guild ${attestation.guildId}:`,
      error
    );
    throw error;
  }
}

/**
 * Retrieve a cached attestation
 *
 * @param walletAddress The wallet address
 * @param guildId The guild ID
 * @param roleId The role ID
 * @returns The cached attestation or null if not found
 */
export async function getCachedAttestation(
  walletAddress: string,
  guildId: string,
  roleId: string
): Promise<CachedAttestation | null> {
  try {
    const key = getAttestationStorageKey(walletAddress, guildId, roleId);
    const stored = await migratingSecureStorage.getItem(key);

    if (!stored) {
      return null;
    }

    await registerAttestationWallet(walletAddress);
    return JSON.parse(stored) as CachedAttestation;
  } catch (error) {
    console.warn(
      `Failed to retrieve cached attestation for ${walletAddress} in guild ${guildId}:`,
      error
    );
    return null;
  }
}

/**
 * Get all attestations for a wallet
 *
 * @param walletAddress The wallet address
 * @returns Array of all cached attestations for this wallet
 */
export async function getAllAttestationsForWallet(
  walletAddress: string
): Promise<CachedAttestation[]> {
  try {
    const entries = await getAttestationIndex(walletAddress);

    if (entries.length > 0) {
      await registerAttestationWallet(walletAddress);
    }

    const attestations: CachedAttestation[] = [];

    for (const entry of entries) {
      const attestation = await getCachedAttestation(
        walletAddress,
        entry.guildId,
        entry.roleId
      );
      if (attestation) {
        attestations.push(attestation);
      }
    }

    return attestations;
  } catch (error) {
    console.warn(`Failed to retrieve attestations for wallet ${walletAddress}:`, error);
    return [];
  }
}

/**
 * Get all attestations for a wallet in a specific guild
 *
 * @param walletAddress The wallet address
 * @param guildId The guild ID
 * @returns Array of all cached attestations for this wallet in the guild
 */
export async function getAttestationsForGuild(
  walletAddress: string,
  guildId: string
): Promise<CachedAttestation[]> {
  const allAttestations = await getAllAttestationsForWallet(walletAddress);
  return allAttestations.filter((a) => a.guildId === guildId);
}

/**
 * Remove a cached attestation
 *
 * @param walletAddress The wallet address
 * @param guildId The guild ID
 * @param roleId The role ID
 */
export async function removeCachedAttestation(
  walletAddress: string,
  guildId: string,
  roleId: string
): Promise<void> {
  try {
    const key = getAttestationStorageKey(walletAddress, guildId, roleId);
    await migratingSecureStorage.removeItem(key);

    // Update index
    const indexKey = getAttestationIndexKey(walletAddress);
    const entries = await getAttestationIndex(walletAddress);

    const filtered = entries.filter(
      (e) => !(e.guildId === guildId && e.roleId === roleId)
    );

    if (filtered.length > 0) {
      await migratingSecureStorage.setItem(indexKey, JSON.stringify(filtered));
    } else {
      await migratingSecureStorage.removeItem(indexKey);
      await unregisterAttestationWallet(walletAddress);
    }
  } catch (error) {
    console.warn(
      `Failed to remove cached attestation for ${walletAddress} in guild ${guildId}:`,
      error
    );
  }
}

/**
 * Clear all attestations for a wallet
 *
 * @param walletAddress The wallet address
 */
export async function clearAttestationsForWallet(walletAddress: string): Promise<void> {
  try {
    const entries = await getAttestationIndex(walletAddress);
    const keys = entries.map((entry) =>
      getAttestationStorageKey(walletAddress, entry.guildId, entry.roleId)
    );
    keys.push(getAttestationIndexKey(walletAddress));

    await Promise.all(keys.map((key) => migratingSecureStorage.removeItem(key)));
    await unregisterAttestationWallet(walletAddress);
  } catch (error) {
    console.error(`Failed to clear attestations for wallet ${walletAddress}:`, error);
    throw error;
  }
}

/**
 * Clear all attestations globally
 * Use with caution - this removes all cached role proofs
 */
export async function clearAllAttestations(): Promise<void> {
  try {
    const wallets = await getAttestationWalletIndex();
    await Promise.all(wallets.map((walletAddress) => clearAttestationsForWallet(walletAddress)));

    // Clean up legacy entries that have not yet been encountered and migrated.
    const legacyKeys = (await AsyncStorage.getAllKeys()) ?? [];
    const attestationKeys = legacyKeys.filter(
      (k) =>
        k.startsWith(ATTESTATION_STORAGE_KEYS.ATTESTATIONS) ||
        k.startsWith(ATTESTATION_STORAGE_KEYS.ATTESTATION_INDEX)
    );

    await Promise.all(attestationKeys.map((key) => migratingSecureStorage.removeItem(key)));
    await migratingSecureStorage.removeItem(ATTESTATION_WALLET_INDEX_KEY);
  } catch (error) {
    console.error('Failed to clear all attestations:', error);
    throw error;
  }
}
