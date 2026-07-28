import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import type { AsyncStorage, PersistedClient } from "@tanstack/query-persist-client-core";
import { EncryptionService, EncryptionError } from "./encryptionService";
import { KeyManager } from "./keyManager";
import { MaybePromise } from "@tanstack/react-query-persist-client";
import { MAX_CACHE_AGE_MS, MAX_CACHE_SIZE_BYTES } from "./offlineCache";

/**
 * EncryptedPersister wraps the TanStack Query async-storage persister with
 * AES-GCM-256 encryption so that sensitive membership/role/guild data is
 * unreadable on disk without the device-bound key held in the secure enclave.
 *
 * **Validates: Requirements 1.1, 1.2, 1.3, 1.5, 1.6, 4.1, 4.2, 4.3**
 *
 * @remarks
 * - The TanStack `createAsyncStoragePersister` accepts user supplied
 *   `serialize` / `deserialize` functions; we provide encrypted variants.
 * - Ciphertext is wrapped in a versioned envelope so legacy (unencrypted)
 *   caches from issue #22 can be detected and migrated on first read.
 * - When the device-bound key is unavailable the persister degrades to an
 *   in-memory-only mode: writes become no-ops and reads return `undefined`.
 *   No sensitive data is persisted without the encryption key.
 *   (Requirement 1.5)
 * - Tampered ciphertext is rejected and the cache entry cleared so the next
 *   persistence rewrites a clean copy. (Requirement 1.6)
 */

/**
 * Magic prefix used to recognise an encrypted envelope on disk.
 * "gp1" = GuildPass encrypted-cache format, version 1.
 */
const ENVELOPE_MAGIC = "gp1:";

/**
 * Backwards-compatibility guard: a value that does not start with the
 * envelope magic is treated as a legacy (pre-encryption) `PersistedClient`
 * JSON blob if it parses and exposes the `timestamp`, `buster` and
 * `clientState` fields defined by `@tanstack/query-persist-client-core`.
 */
function looksLikeLegacyPersistedClient(value: unknown): value is PersistedClient {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as PersistedClient).timestamp === "number" &&
    typeof (value as PersistedClient).buster === "string" &&
    "clientState" in (value as PersistedClient)
  );
}

/**
 * Base64 helpers that work without `Buffer` (React Native / Hermes does not
 * always expose a global `Buffer`). `btoa`/`atob` are available in Hermes and
 * in the Vitest node environment.
 */
function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Decode a 64-char hex key string (as returned by `KeyManager`) into the
 * 32-byte `ArrayBuffer` expected by `EncryptionService.normalizeKey`.
 */
function hexKeyToArrayBuffer(hex: string): ArrayBuffer {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  // Copy into a fresh ArrayBuffer so callers cannot mutate the key bytes
  // through the live `Uint8Array` view.
  return bytes.buffer.slice(0);
}

/** Shape of the on-disk envelope (serialized as JSON). */
interface EncryptedEnvelope {
  /** Magic + version tag, e.g. "gp1:". */
  v: string;
  /** Base64-encoded 12-byte AES-GCM nonce. */
  n: string;
  /** Base64-encoded 16-byte AES-GCM authentication tag. */
  t: string;
  /** Base64-encoded ciphertext of the JSON-serialized `PersistedClient`. */
  c: string;
}

export interface EncryptedPersisterOptions {
  /** AsyncStorage-compatible backend (AsyncStorage, MMKV, in-memory mock, etc). */
  storage: AsyncStorage<string> | undefined | null;
  /** Key under which the encrypted envelope is stored. */
  key?: string;
  /** Throttle window for persisted writes, in ms. */
  throttleTime?: number;
  /** EncryptionService used for AES-GCM-256 operations. */
  encryptionService: EncryptionService;
  /** KeyManager supplying the device-bound key. */
  keyManager: KeyManager;
  /** Maximum age in ms for persisted query cache entries. */
  maxAge?: number;
  /** Maximum size in bytes for the persisted query cache payload. */
  maxSize?: number;
  /**
   * Optional: hook invoked when migration from a legacy unencrypted cache
   * succeeds or fails. Useful for telemetry without coupling to logs.
   */
  onMigration?: (result: { status: "migrated" | "cleared"; reason?: string }) => void;
}

/**
 * Helper to perform max-age and max-size eviction on a PersistedClient.
 */
export function evictUnboundedData(
  client: PersistedClient,
  maxAge: number = MAX_CACHE_AGE_MS,
  maxSize: number = MAX_CACHE_SIZE_BYTES,
): PersistedClient {
  const now = client.timestamp || Date.now();
  let queries = (client.clientState?.queries ? [...client.clientState.queries] : []) as any[];

  if (maxAge > 0) {
    queries = queries.filter((q) => {
      const dataUpdatedAt = q.state?.dataUpdatedAt;
      if (dataUpdatedAt === undefined || dataUpdatedAt === 0) return true;
      return now - dataUpdatedAt <= maxAge;
    });
  }

  let prunedClient: PersistedClient = {
    ...client,
    clientState: {
      ...client.clientState,
      queries,
    },
  };

  if (maxSize > 0 && JSON.stringify(prunedClient).length > maxSize) {
    queries.sort((a, b) => (a.state?.dataUpdatedAt ?? 0) - (b.state?.dataUpdatedAt ?? 0));

    while (queries.length > 0 && JSON.stringify(prunedClient).length > maxSize) {
      queries.shift();
      prunedClient = {
        ...client,
        clientState: {
          ...client.clientState,
          queries,
        },
      };
    }
  }

  return prunedClient;
}

/**
 * Create a TanStack Query persister whose on-disk payload is AES-GCM-256
 * encrypted with a device-bound key from `expo-secure-store`.
 *
 * The returned object satisfies the `Persister` interface returned by the
 * upstream `createAsyncStoragePersister`, so it is a drop-in replacement.
 */
export function createEncryptedAsyncStoragePersister({
  storage,
  key = "REACT_QUERY_OFFLINE_CACHE",
  throttleTime = 1000,
  encryptionService,
  keyManager,
  maxAge = MAX_CACHE_AGE_MS,
  maxSize = MAX_CACHE_SIZE_BYTES,
  onMigration,
}: EncryptedPersisterOptions) {
  // Lazily-loaded raw key bytes. Cached for the lifetime of the persister
  // so we pay the SecureStore retrieval cost at most once per session.
  let cachedKeyBuffer: ArrayBuffer | null = null;
  let keyLoadingPromise: Promise<ArrayBuffer | null> | null = null;
  // Set to true if the device-bound key cannot be retrieved; once set we
  // stop attempting to persist so reads/writes degrade to in-memory only.
  let memoryOnlyMode = false;
  let rotationAttempted = false;

  async function loadKey(): Promise<ArrayBuffer | null> {
    if (memoryOnlyMode) {
      return null;
    }
    if (cachedKeyBuffer) {
      return cachedKeyBuffer;
    }
    if (keyLoadingPromise) {
      return keyLoadingPromise;
    }
    keyLoadingPromise = (async () => {
      try {
        let hexKey = await keyManager.getOrCreateKey();
        if (!rotationAttempted && storage) {
          rotationAttempted = true;
          const keyInfo = await keyManager.getKeyInfo();
          if (keyInfo?.needsRotation) {
            hexKey = await keyManager.rotateKey({
              reencrypt: async ({ oldKey, newKey }) => {
                await rotateStoredEnvelope(oldKey, newKey);
              },
            });
          }
        }
        cachedKeyBuffer = hexKeyToArrayBuffer(hexKey);
        return cachedKeyBuffer;
      } catch (error) {
        console.warn(
          "[EncryptedPersister] Device-bound key unavailable, switching to in-memory only mode:",
          error instanceof Error ? error.message : String(error),
        );
        memoryOnlyMode = true;
        return null;
      } finally {
        keyLoadingPromise = null;
      }
    })();
    return keyLoadingPromise;
  }

  async function rotateStoredEnvelope(oldKey: string, newKey: string): Promise<void> {
    if (!storage) {
      return;
    }

    const storedString = await storage.getItem(key);
    if (!storedString) {
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(storedString);
    } catch {
      throw new Error("stored cache is not valid JSON");
    }

    if (
      typeof parsed !== "object" ||
      parsed === null ||
      (parsed as Partial<EncryptedEnvelope>).v !== ENVELOPE_MAGIC
    ) {
      return;
    }

    const oldKeyBuffer = hexKeyToArrayBuffer(oldKey);
    const newKeyBuffer = hexKeyToArrayBuffer(newKey);
    const restored = await decryptEnvelope(parsed as EncryptedEnvelope, oldKeyBuffer);
    const rotatedEnvelope = await encryptClient(restored, newKeyBuffer);
    await storage.setItem(key, JSON.stringify(rotatedEnvelope));
  }

  async function serialize(client: PersistedClient): Promise<string> {
    const keyBuffer = await loadKey();
    if (!keyBuffer) {
      // In-memory only mode: TanStack still calls persistClient, but we
      // cannot safely persist ciphertext without the key, so we no-op by
      // returning the empty string — the underlying storage write will
      // then store nothing meaningful. We never write plaintext.
      return "";
    }
    const prunedClient = evictUnboundedData(client, maxAge, maxSize);
    return JSON.stringify(await encryptClient(prunedClient, keyBuffer));
  }

  async function deserialize(storedString: string): Promise<PersistedClient | undefined> {
    if (!storedString) {
      return undefined;
    }

    // Parse the on-disk value once. The encrypted envelope is JSON too, so a
    // single parse covers both the encrypted envelope path and the legacy
    // plaintext `PersistedClient` path. Anything that fails to parse is
    // treated as a corrupted / foreign entry.
    let parsed: unknown;
    try {
      parsed = JSON.parse(storedString);
    } catch {
      return undefined;
    }

    // --- Encrypted envelope path ------------------------------------------------
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      (parsed as Partial<EncryptedEnvelope>).v === ENVELOPE_MAGIC
    ) {
      // The check above already guarantees `v === ENVELOPE_MAGIC`, so a
      // cast here is safe. We re-validate inside `restoreFromEnvelope` as
      // a defence in depth.
      return await restoreFromEnvelope(parsed as EncryptedEnvelope);
    }

    // --- Legacy / migration path ------------------------------------------------
    if (looksLikeLegacyPersistedClient(parsed)) {
      const legacyClient = parsed as PersistedClient;
      // Migrate immediately so the plaintext blob is not left on disk. We
      // encrypt-and-overwrite synchronously here, bounded by the encryption
      // performance target (<50ms for typical payloads). If re-encryption
      // fails — for any reason, including key unavailability or exceeding
      // the timeout — we clear the unencrypted entry and report, so we
      // never leave plaintext behind. (Requirement 4.3)
      let migrated = false;
      try {
        migrated = await migrateLegacyClient(legacyClient);
        if (migrated) {
          onMigration?.({ status: "migrated", reason: "legacy-detected" });
        } else {
          await safeClearStoredValue();
          onMigration?.({ status: "cleared", reason: "migration-failed" });
        }
      } catch (migrationError) {
        await safeClearStoredValue();
        onMigration?.({
          status: "cleared",
          reason: migrationError instanceof Error ? migrationError.message : "unknown-error",
        });
      }
      // When migration succeeded we hydrate from the legacy data so users
      // keep their offline cache across the upgrade. When migration failed
      // (e.g. the device-bound key is unavailable) we MUST NOT surface the
      // plaintext back to TanStack — Requirement 1.5 forbids retrieving
      // sensitive data without the key.
      return migrated ? legacyClient : undefined;
    }

    return undefined;
  }

  async function migrateLegacyClient(legacyClient: PersistedClient): Promise<boolean> {
    const keyBuffer = await loadKey();
    if (!keyBuffer) {
      return false;
    }
    const plaintext = JSON.stringify(legacyClient);
    const { encrypted, nonce, authTag } = await encryptionService.encrypt(plaintext, keyBuffer);
    const envelope = createEnvelope(encrypted, nonce, authTag);
    if (storage) {
      await storage.setItem(key, JSON.stringify(envelope));
    }
    return true;
  }

  async function encryptClient(client: PersistedClient, keyBuffer: ArrayBuffer): Promise<EncryptedEnvelope> {
    const plaintext = JSON.stringify(client);
    const { encrypted, nonce, authTag } = await encryptionService.encrypt(plaintext, keyBuffer);
    return createEnvelope(encrypted, nonce, authTag);
  }

  function createEnvelope(
    encrypted: ArrayBuffer,
    nonce: Uint8Array,
    authTag: Uint8Array,
  ): EncryptedEnvelope {
    return {
      v: ENVELOPE_MAGIC,
      n: bytesToBase64(nonce),
      t: bytesToBase64(authTag),
      c: bytesToBase64(new Uint8Array(encrypted)),
    };
  }

  async function safeClearStoredValue(): Promise<void> {
    try {
      if (storage) {
        await storage.removeItem(key);
      }
    } catch (clearError) {
      console.warn(
        "[EncryptedPersister] Failed to clear legacy cache entry:",
        clearError instanceof Error ? clearError.message : String(clearError),
      );
    }
  }

  async function restoreFromEnvelope(
    envelope: EncryptedEnvelope,
  ): Promise<PersistedClient | undefined> {
    const keyBuffer = await loadKey();
    if (!keyBuffer) {
      return undefined;
    }

    if (!envelope || envelope.v !== ENVELOPE_MAGIC) {
      return undefined;
    }

    try {
      const decrypted = await decryptEnvelope(envelope, keyBuffer);
      if (decrypted && maxAge > 0 && Date.now() - decrypted.timestamp > maxAge) {
        await safeClearStoredValue();
        return undefined;
      }
      return decrypted;
    } catch (error) {
      if (error instanceof EncryptionError) {
        const isTamper =
          error.code === "AUTHENTICATION_FAILED" || error.code === "DECRYPTION_FAILED";
        if (isTamper) {
          // Tampered / corrupted ciphertext: clear the entry so a clean
          // copy is persisted on the next successful fetch.
          await safeClearStoredValue();
          onMigration?.({ status: "cleared", reason: "tamper-detected" });
          return undefined;
        }
      }
      console.warn(
        "[EncryptedPersister] Failed to restore encrypted cache:",
        error instanceof Error ? error.message : String(error),
      );
      return undefined;
    }
  }

  async function decryptEnvelope(
    envelope: EncryptedEnvelope,
    keyBuffer: ArrayBuffer,
  ): Promise<PersistedClient> {
    const nonce = base64ToBytes(envelope.n);
    const authTag = base64ToBytes(envelope.t);
    const cipherBytes = base64ToBytes(envelope.c);
    const cipherBuffer = new ArrayBuffer(cipherBytes.length);
    new Uint8Array(cipherBuffer).set(cipherBytes);

    const { decrypted } = await encryptionService.decrypt<PersistedClient>(
      cipherBuffer,
      nonce,
      authTag,
      keyBuffer,
    );
    return decrypted;
  }

  return createAsyncStoragePersister({
    storage,
    key,
    throttleTime,
    serialize,
    deserialize: deserialize as (cachedString: string) => MaybePromise<PersistedClient>,
  });
}
