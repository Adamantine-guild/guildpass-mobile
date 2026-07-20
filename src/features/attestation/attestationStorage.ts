/**
 * Attestation storage and caching layer
 * Manages persistent storage of attestations for offline verification
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { type CachedAttestation, type RoleAttestation, ATTESTATION_STORAGE_KEYS } from './types';

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

    await AsyncStorage.setItem(key, JSON.stringify(cached));

    // Add to index
    const indexKey = `${ATTESTATION_STORAGE_KEYS.ATTESTATION_INDEX}${walletAddress}`;
    const index = await AsyncStorage.getItem(indexKey);
    const entries = index ? (JSON.parse(index) as Array<{ guildId: string; roleId: string }>) : [];

    const exists = entries.some(
      (e) => e.guildId === attestation.guildId && e.roleId === attestation.roleId
    );

    if (!exists) {
      entries.push({
        guildId: attestation.guildId,
        roleId: attestation.roleId,
      });
      await AsyncStorage.setItem(indexKey, JSON.stringify(entries));
    }
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
    const stored = await AsyncStorage.getItem(key);

    if (!stored) {
      return null;
    }

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
    const indexKey = `${ATTESTATION_STORAGE_KEYS.ATTESTATION_INDEX}${walletAddress}`;
    const index = await AsyncStorage.getItem(indexKey);
    const entries = index ? (JSON.parse(index) as Array<{ guildId: string; roleId: string }>) : [];

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
    await AsyncStorage.removeItem(key);

    // Update index
    const indexKey = `${ATTESTATION_STORAGE_KEYS.ATTESTATION_INDEX}${walletAddress}`;
    const index = await AsyncStorage.getItem(indexKey);
    const entries = index ? (JSON.parse(index) as Array<{ guildId: string; roleId: string }>) : [];

    const filtered = entries.filter(
      (e) => !(e.guildId === guildId && e.roleId === roleId)
    );

    if (filtered.length > 0) {
      await AsyncStorage.setItem(indexKey, JSON.stringify(filtered));
    } else {
      await AsyncStorage.removeItem(indexKey);
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
    const attestations = await getAllAttestationsForWallet(walletAddress);

    const keys = attestations.map((a) =>
      getAttestationStorageKey(walletAddress, a.guildId, a.roleId)
    );
    keys.push(`${ATTESTATION_STORAGE_KEYS.ATTESTATION_INDEX}${walletAddress}`);

    await AsyncStorage.multiRemove(keys);
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
    const allKeys = await AsyncStorage.getAllKeys();
    const attestationKeys = allKeys.filter(
      (k) =>
        k.startsWith(ATTESTATION_STORAGE_KEYS.ATTESTATIONS) ||
        k.startsWith(ATTESTATION_STORAGE_KEYS.ATTESTATION_INDEX)
    );

    await AsyncStorage.multiRemove(attestationKeys);
  } catch (error) {
    console.error('Failed to clear all attestations:', error);
    throw error;
  }
}
