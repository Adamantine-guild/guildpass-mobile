import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { sha256, toHex } from "viem";
import type { StateStorage } from "zustand/middleware";

const secureStoreOptions: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

const SECURE_STORE_KEY_PATTERN = /^[\w.-]+$/;
const SECURE_STORE_CHUNK_BYTES = 1_800;
const CHUNK_MANIFEST_PREFIX = "gp.chunks.v1:";
const LEGACY_CLEANUP_ATTEMPTS = 3;

// Preserve only fixed, non-sensitive names that may already exist in Keychain
// or Keystore. Every other logical name is opaque, even if its characters are
// technically accepted by SecureStore.
const STABLE_SECURE_STORE_KEYS = new Set([
  "wallet-storage",
  "session-storage",
  "sync-storage",
  "biometric-storage",
]);

const SENSITIVE_LEGACY_KEYS = new Set([
  "wallet-storage",
  "session-storage",
  "sync-storage",
  "guildpass:reconciliation:v1",
  "guildpass:issuer-keys-index",
]);

const SENSITIVE_LEGACY_KEY_PREFIXES = [
  "guildpass:attestations:",
  "guildpass:attestation-index",
  "guildpass:issuer-keys:",
];

function getLegacyEncodedSecureStorageKey(name: string): string {
  let encoded = "";
  for (let index = 0; index < name.length; index += 1) {
    encoded += name.charCodeAt(index).toString(16).padStart(4, "0");
  }
  return `gp.${encoded}`;
}

/** Map arbitrary storage names to opaque, SecureStore-safe keys. */
export function getSecureStorageKey(name: string): string {
  if (STABLE_SECURE_STORE_KEYS.has(name)) {
    return name;
  }
  return `gp.${sha256(toHex(name)).slice(2)}`;
}

function utf8ByteLength(value: string): number {
  let bytes = 0;
  for (const character of value) {
    const codePoint = character.codePointAt(0)!;
    bytes += codePoint <= 0x7f ? 1 : codePoint <= 0x7ff ? 2 : codePoint <= 0xffff ? 3 : 4;
  }
  return bytes;
}

function splitIntoSecureStoreChunks(value: string): string[] {
  const chunks: string[] = [];
  let current = "";
  let currentBytes = 0;

  for (const character of value) {
    const characterBytes = utf8ByteLength(character);
    if (current && currentBytes + characterBytes > SECURE_STORE_CHUNK_BYTES) {
      chunks.push(current);
      current = "";
      currentBytes = 0;
    }
    current += character;
    currentBytes += characterBytes;
  }

  if (current) chunks.push(current);
  return chunks;
}

function parseChunkCount(value: string | null): number {
  if (!value?.startsWith(CHUNK_MANIFEST_PREFIX)) return 0;
  const count = Number(value.slice(CHUNK_MANIFEST_PREFIX.length));
  return Number.isSafeInteger(count) && count > 0 ? count : 0;
}

function getChunkKey(secureKey: string, index: number): string {
  return `${secureKey}.chunk.${index}`;
}

const rawAsyncStorage: StateStorage = {
  getItem: (name) => AsyncStorage.getItem(name),
  setItem: (name, value) => AsyncStorage.setItem(name, value),
  removeItem: (name) => AsyncStorage.removeItem(name),
};

async function readSecureValue(secureKey: string, displayName: string): Promise<string | null> {
  const stored = await SecureStore.getItemAsync(secureKey);
  const chunkCount = parseChunkCount(stored);
  if (chunkCount === 0) return stored;

  const chunks = await Promise.all(
    Array.from({ length: chunkCount }, (_, index) =>
      SecureStore.getItemAsync(getChunkKey(secureKey, index)),
    ),
  );
  if (chunks.some((chunk) => chunk === null)) {
    throw new Error(`Incomplete SecureStore value for ${displayName}`);
  }
  return chunks.join("");
}

async function writeSecureValue(secureKey: string, value: string): Promise<void> {
  const previous = await SecureStore.getItemAsync(secureKey);
  const previousChunkCount = parseChunkCount(previous);

  if (utf8ByteLength(value) <= SECURE_STORE_CHUNK_BYTES) {
    await SecureStore.setItemAsync(secureKey, value, secureStoreOptions);
    await Promise.all(
      Array.from({ length: previousChunkCount }, (_, index) =>
        SecureStore.deleteItemAsync(getChunkKey(secureKey, index)),
      ),
    );
    return;
  }

  const chunks = splitIntoSecureStoreChunks(value);
  await Promise.all(
    chunks.map((chunk, index) =>
      SecureStore.setItemAsync(getChunkKey(secureKey, index), chunk, secureStoreOptions),
    ),
  );
  await SecureStore.setItemAsync(
    secureKey,
    `${CHUNK_MANIFEST_PREFIX}${chunks.length}`,
    secureStoreOptions,
  );
  await Promise.all(
    Array.from({ length: Math.max(0, previousChunkCount - chunks.length) }, (_, index) =>
      SecureStore.deleteItemAsync(getChunkKey(secureKey, chunks.length + index)),
    ),
  );
}

async function removeSecureValue(secureKey: string): Promise<void> {
  const stored = await SecureStore.getItemAsync(secureKey);
  const chunkCount = parseChunkCount(stored);
  await Promise.all([
    SecureStore.deleteItemAsync(secureKey),
    ...Array.from({ length: chunkCount }, (_, index) =>
      SecureStore.deleteItemAsync(getChunkKey(secureKey, index)),
    ),
  ]);
}

function getPreviousSecureStorageKey(name: string): string | null {
  const previousKey = SECURE_STORE_KEY_PATTERN.test(name)
    ? name
    : getLegacyEncodedSecureStorageKey(name);
  return previousKey === getSecureStorageKey(name) ? null : previousKey;
}

const rawSecureStorage: StateStorage = {
  getItem: async (name) => {
    const secureKey = getSecureStorageKey(name);
    const currentValue = await readSecureValue(secureKey, name);
    const previousKey = getPreviousSecureStorageKey(name);

    if (currentValue != null) {
      if (previousKey) await removeSecureValue(previousKey);
      return currentValue;
    }
    if (!previousKey) return null;

    const previousValue = await readSecureValue(previousKey, name);
    if (previousValue == null) return null;

    await writeSecureValue(secureKey, previousValue);
    await removeSecureValue(previousKey);
    return previousValue;
  },
  setItem: async (name, value) => {
    const secureKey = getSecureStorageKey(name);
    await writeSecureValue(secureKey, value);
    const previousKey = getPreviousSecureStorageKey(name);
    if (previousKey) await removeSecureValue(previousKey);
  },
  removeItem: async (name) => {
    const secureKey = getSecureStorageKey(name);
    const previousKey = getPreviousSecureStorageKey(name);
    await Promise.all([
      removeSecureValue(secureKey),
      ...(previousKey ? [removeSecureValue(previousKey)] : []),
    ]);
  },
};

/**
 * Storage adapter for non-sensitive data using AsyncStorage.
 */
export const asyncStorage: StateStorage = {
  getItem: async (name: string): Promise<string | null> => {
    try {
      return await AsyncStorage.getItem(name);
    } catch (e) {
      console.error(`Error reading from AsyncStorage: ${name}`, e);
      return null;
    }
  },
  setItem: async (name: string, value: string): Promise<void> => {
    try {
      await AsyncStorage.setItem(name, value);
    } catch (e) {
      console.error(`Error writing to AsyncStorage: ${name}`, e);
    }
  },
  removeItem: async (name: string): Promise<void> => {
    try {
      await AsyncStorage.removeItem(name);
    } catch (e) {
      console.error(`Error removing from AsyncStorage: ${name}`, e);
    }
  },
};

/**
 * Storage adapter for sensitive data using expo-secure-store.
 */
export const secureStorage: StateStorage = {
  getItem: async (name: string): Promise<string | null> => {
    try {
      return await rawSecureStorage.getItem(name);
    } catch (e) {
      console.error(`Error reading from SecureStore: ${name}`, e);
      return null;
    }
  },
  setItem: async (name: string, value: string): Promise<void> => {
    try {
      await rawSecureStorage.setItem(name, value);
    } catch (e) {
      console.error(`Error writing to SecureStore: ${name}`, e);
    }
  },
  removeItem: async (name: string): Promise<void> => {
    try {
      await rawSecureStorage.removeItem(name);
    } catch (e) {
      console.error(`Error removing from SecureStore: ${name}`, e);
    }
  },
};

async function removeLegacySensitiveValue(name: string): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt < LEGACY_CLEANUP_ATTEMPTS; attempt += 1) {
    try {
      await rawAsyncStorage.removeItem(name);
      const remaining = await rawAsyncStorage.getItem(name);
      if (remaining == null) return;
      lastError = new Error(`AsyncStorage key still exists after removal: ${name}`);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error(`Unable to clear legacy sensitive data from AsyncStorage: ${name}`);
}

async function clearLegacyOrFailClosed(name: string): Promise<boolean> {
  try {
    await removeLegacySensitiveValue(name);
    return true;
  } catch (error) {
    console.error(`Error clearing legacy sensitive data from AsyncStorage: ${name}`, error);
    return false;
  }
}

/**
 * SecureStore-backed Zustand storage with a one-way migration from AsyncStorage.
 *
 * Sensitive state written by older app versions is copied into SecureStore and
 * removed from AsyncStorage on first read. Migration fails closed: when the
 * secure write is unavailable, the plaintext legacy value is deleted and is
 * not returned to the store for hydration.
 */
export const migratingSecureStorage: StateStorage = {
  getItem: async (name: string): Promise<string | null> => {
    let secureValue: string | null;

    try {
      secureValue = await rawSecureStorage.getItem(name);
    } catch (error) {
      console.error(`Error reading sensitive data from SecureStore: ${name}`, error);
      await removeLegacySensitiveValue(name);
      return null;
    }

    if (secureValue != null) {
      // Also cleans up a stale plaintext copy left by an interrupted upgrade.
      return (await clearLegacyOrFailClosed(name)) ? secureValue : null;
    }

    let legacyValue: string | null;
    try {
      legacyValue = await rawAsyncStorage.getItem(name);
    } catch (error) {
      console.error(`Error reading legacy sensitive data from AsyncStorage: ${name}`, error);
      return null;
    }

    if (legacyValue == null) {
      return null;
    }

    try {
      await rawSecureStorage.setItem(name, legacyValue);
    } catch (error) {
      console.error(`Error migrating sensitive data to SecureStore: ${name}`, error);
      await clearLegacyOrFailClosed(name);
      return null;
    }

    return (await clearLegacyOrFailClosed(name)) ? legacyValue : null;
  },

  setItem: async (name: string, value: string): Promise<void> => {
    try {
      await rawSecureStorage.setItem(name, value);
    } catch (error) {
      console.error(`Error writing sensitive data to SecureStore: ${name}`, error);
    }
    // Never retain a fallback or stale plaintext copy.
    await clearLegacyOrFailClosed(name);
  },

  removeItem: async (name: string): Promise<void> => {
    let secureRemovalError: unknown;
    try {
      await rawSecureStorage.removeItem(name);
    } catch (error) {
      console.error(`Error removing sensitive data from SecureStore: ${name}`, error);
      secureRemovalError = error;
    }
    await removeLegacySensitiveValue(name);
    if (secureRemovalError) throw secureRemovalError;
  },
};

export interface SensitiveStorageMigrationReport {
  migratedKeys: string[];
  clearedKeys: string[];
  failedKeys: string[];
}

function isSensitiveLegacyKey(key: string): boolean {
  return (
    SENSITIVE_LEGACY_KEYS.has(key) ||
    SENSITIVE_LEGACY_KEY_PREFIXES.some((prefix) => key.startsWith(prefix))
  );
}

/** Exhaustively migrates every known sensitive AsyncStorage key during startup. */
export async function migrateLegacySensitiveStorage(): Promise<SensitiveStorageMigrationReport> {
  const report: SensitiveStorageMigrationReport = {
    migratedKeys: [],
    clearedKeys: [],
    failedKeys: [],
  };
  const candidateKeys = new Set(SENSITIVE_LEGACY_KEYS);

  try {
    const storedKeys = (await AsyncStorage.getAllKeys()) ?? [];
    for (const key of storedKeys) {
      if (isSensitiveLegacyKey(key)) candidateKeys.add(key);
    }
  } catch (error) {
    console.error("Unable to enumerate AsyncStorage for sensitive-data migration", error);
    report.failedKeys.push("<async-storage-enumeration>");
  }

  for (const key of candidateKeys) {
    try {
      const legacyValue = await rawAsyncStorage.getItem(key);
      if (legacyValue == null) continue;

      await migratingSecureStorage.getItem(key);
      const [remainingLegacyValue, secureValue] = await Promise.all([
        rawAsyncStorage.getItem(key),
        rawSecureStorage.getItem(key),
      ]);

      if (remainingLegacyValue != null) {
        report.failedKeys.push(key);
      } else if (secureValue != null) {
        report.migratedKeys.push(key);
      } else {
        // SecureStore was unavailable; fail-closed cleanup removed plaintext.
        report.clearedKeys.push(key);
      }
    } catch (error) {
      console.error(`Sensitive storage migration failed: ${key}`, error);
      report.failedKeys.push(key);
    }
  }

  return report;
}

/**
 * Creates a hybrid storage that delegates fields to different storage engines.
 * @param config Map of field names to their storage engine (asyncStorage or secureStorage)
 * @param defaultStorage Default storage engine for fields not in the config
 */
export function createHybridStorage(
  config: Record<string, StateStorage>,
  defaultStorage: StateStorage = asyncStorage,
): StateStorage {
  return {
    getItem: async (name: string): Promise<string | null> => {
      // For simplicity in Zustand persistence, we store the whole state object.
      // A truly hybrid storage for a single Zustand store is tricky because
      // Zustand's persist middleware expects to get/set the whole state as a single JSON string.
      // To implement a split storage, we'd need to intercept the JSON serialization.

      // For now, we'll use this primarily as a way to expose both storages,
      // or we can implement a custom persister that splits the state.
      return await defaultStorage.getItem(name);
    },
    setItem: async (name: string, value: string): Promise<void> => {
      await defaultStorage.setItem(name, value);
    },
    removeItem: async (name: string): Promise<void> => {
      await defaultStorage.removeItem(name);
    },
  };
}
