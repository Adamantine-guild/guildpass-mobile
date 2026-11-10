import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

/**
 * KeyManager - Manages encryption key lifecycle for the encrypted offline cache
 *
 * Responsibilities:
 * - Generate cryptographically secure 256-bit AES keys
 * - Store keys in expo-secure-store with device-bound access controls
 * - Retrieve keys with timeout handling (100ms limit)
 * - Handle key storage failures with retry logic (3 attempts with exponential backoff)
 * - Rotate keys every 30 days or on security events
 */

const ENCRYPTION_KEY_ID = "guildpass_encryption_key_v1";
const KEY_CREATION_TIMESTAMP_ID = "guildpass_key_timestamp_v1";
const KEY_ROTATION_INTERVAL_DAYS = 30;
const KEY_ROTATION_INTERVAL_MS = KEY_ROTATION_INTERVAL_DAYS * 24 * 60 * 60 * 1000;

// Exponential backoff delays in milliseconds
const RETRY_DELAYS_MS = [100, 400, 900]; // 100ms, 400ms, 900ms (total ~1.4s for 3 retries)

/**
 * Baseline timeout for platform secure-storage retrieval (500ms).
 * Replaces the overly aggressive 100ms timeout to avoid false-positive failures
 * during platform Keystore/Keychain operations, HSM latency, or cold boot.
 */
export const DEFAULT_KEY_RETRIEVAL_TIMEOUT_MS = 500;
export const MAX_KEY_RETRIEVAL_TIMEOUT_MS = 1500;
export const KEY_RETRIEVAL_TIMEOUT_MS = DEFAULT_KEY_RETRIEVAL_TIMEOUT_MS;

export interface KeyManagerConfig {
  /** Custom key identifier (useful for testing) */
  keyId?: string;
  /** Custom baseline timeout for key retrieval in milliseconds */
  retrievalTimeoutMs?: number;
  /** Maximum number of retry attempts for key storage */
  maxRetries?: number;
  /** Whether to adapt retrieval timeout dynamically based on observed latency (default: true) */
  adaptiveTimeout?: boolean;
}

export interface KeyInfo {
  /** The encryption key as a hex string */
  key: string;
  /** When the key was created (timestamp in milliseconds) */
  createdAt: number;
  /** Whether the key needs rotation */
  needsRotation: boolean;
}

export interface KeyRotationContext {
  /** The currently stored key, used to decrypt existing ciphertext. */
  oldKey: string;
  /** The candidate replacement key, used to re-encrypt existing ciphertext. */
  newKey: string;
}

export interface KeyRotationOptions {
  /**
   * Re-encrypt persisted data before the stored key is overwritten.
   * If this callback fails, rotation is deferred and the old key remains active.
   */
  reencrypt?: (context: KeyRotationContext) => Promise<void>;
}

export class KeyManagerError extends Error {
  constructor(
    message: string,
    public readonly code: KeyManagerErrorCode,
    public readonly originalError?: unknown,
  ) {
    super(message);
    this.name = "KeyManagerError";
  }
}

export enum KeyManagerErrorCode {
  // Key generation failed
  GENERATION_FAILED = "GENERATION_FAILED",
  // Key storage failed after all retries
  STORAGE_FAILED = "STORAGE_FAILED",
  // Key retrieval timed out
  RETRIEVAL_TIMEOUT = "RETRIEVAL_TIMEOUT",
  // Key not found in secure store
  KEY_NOT_FOUND = "KEY_NOT_FOUND",
  // Secure store not available on this platform
  SECURE_STORE_UNAVAILABLE = "SECURE_STORE_UNAVAILABLE",
  // Key retrieval failed
  RETRIEVAL_FAILED = "RETRIEVAL_FAILED",
  // Invalid key format
  INVALID_KEY_FORMAT = "INVALID_KEY_FORMAT",
}

/**
 * KeyManager class for managing encryption key lifecycle
 */
export class KeyManager {
  private keyId: string;
  private retrievalTimeoutMs: number;
  private maxRetries: number;
  private adaptiveTimeout: boolean;
  private memoryFallbackKey: string | null = null;
  private secureStoreAvailableCache: boolean | null = null;
  private observedLatencies: number[] = [];

  constructor(config?: KeyManagerConfig) {
    this.keyId = config?.keyId ?? ENCRYPTION_KEY_ID;
    this.retrievalTimeoutMs = config?.retrievalTimeoutMs ?? DEFAULT_KEY_RETRIEVAL_TIMEOUT_MS;
    this.maxRetries = config?.maxRetries ?? RETRY_DELAYS_MS.length;
    this.adaptiveTimeout = config?.adaptiveTimeout ?? true;
  }

  /**
   * Initialize the KeyManager and ensure a key exists
   * This should be called during app startup
   */
  async initialize(): Promise<void> {
    try {
      const existingKey = await this.getKey();
      if (!existingKey) {
        await this.generateAndStoreKey();
      } else {
        // Check if key needs rotation. Actual rotation is coordinated by
        // EncryptedPersister so existing encrypted cache can be migrated first.
        const keyInfo = await this.getKeyInfo();
        if (keyInfo?.needsRotation) {
          console.warn("[KeyManager] Key rotation deferred until encrypted cache migration");
        }
      }
    } catch (error) {
      // If key retrieval fails, generate a new key
      console.warn("[KeyManager] Key retrieval failed, generating new key:", error);
      await this.generateAndStoreKey();
    }
  }

  /**
   * Generate a cryptographically secure 256-bit (32-byte) AES key
   * Returns the key as a hex string (64 characters)
   */
  private generateKey(): string {
    // Generate 32 random bytes (256 bits)
    const keyBytes = new Uint8Array(32);

    // Use crypto.getRandomValues for cryptographically secure random generation
    // This is available in React Native's JavaScript environment
    if (typeof crypto !== "undefined" && crypto.getRandomValues) {
      crypto.getRandomValues(keyBytes);
    } else {
      // Fallback for environments without crypto.getRandomValues
      // This shouldn't happen in React Native, but we include it for safety
      for (let i = 0; i < 32; i++) {
        keyBytes[i] = Math.floor(Math.random() * 256);
      }
      console.warn("[KeyManager] Using fallback random generation - not cryptographically secure");
    }

    // Convert to hex string
    return Array.from(keyBytes)
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  }

  /**
   * Store the encryption key in expo-secure-store with device-bound access controls
   * Implements retry logic with exponential backoff
   */
  private async storeKey(key: string): Promise<void> {
    if (!(await this.isSecureStoreAvailable())) {
      throw new KeyManagerError(
        "Secure store is not available on this device",
        KeyManagerErrorCode.SECURE_STORE_UNAVAILABLE,
      );
    }

    const options: SecureStore.SecureStoreOptions = {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    };

    const storeWithRetry = async (attempt: number): Promise<void> => {
      try {
        await SecureStore.setItemAsync(this.keyId, key, options);

        // Store the timestamp for key rotation tracking
        const timestamp = Date.now().toString();
        await SecureStore.setItemAsync(`${this.keyId}_timestamp`, timestamp, options);
      } catch (error) {
        if (attempt < this.maxRetries) {
          // Exponential backoff before retry
          const delay = RETRY_DELAYS_MS[attempt] ?? 1000;
          await this.sleep(delay);
          return storeWithRetry(attempt + 1);
        }
        throw new KeyManagerError(
          `Failed to store encryption key after ${this.maxRetries} attempts`,
          KeyManagerErrorCode.STORAGE_FAILED,
          error,
        );
      }
    };

    await storeWithRetry(0);
  }

  /**
   * Retrieve the encryption key from expo-secure-store
   * Implements adaptive capability-aware timeout for key retrieval
   */
  async getKey(): Promise<string | null> {
    if (!(await this.isSecureStoreAvailable())) {
      // Return in-memory fallback key if available
      if (this.memoryFallbackKey) {
        return this.memoryFallbackKey;
      }
      throw new KeyManagerError(
        "Secure store is not available on this device",
        KeyManagerErrorCode.SECURE_STORE_UNAVAILABLE,
      );
    }

    const effectiveTimeout = this.getEffectiveTimeoutMs();
    const startTime = Date.now();

    try {
      // Race between retrieval and adaptive timeout
      const key = await this.withTimeout(
        SecureStore.getItemAsync(this.keyId),
        effectiveTimeout,
      );

      this.recordRetrievalLatency(Date.now() - startTime);

      if (key) {
        // Validate key format (should be 64 hex characters for 256-bit key)
        if (!this.isValidKeyFormat(key)) {
          throw new KeyManagerError(
            "Stored key has invalid format",
            KeyManagerErrorCode.INVALID_KEY_FORMAT,
          );
        }
        return key;
      }

      return null;
    } catch (error) {
      if (error instanceof KeyManagerError) {
        throw error;
      }

      // If timeout occurred, switch to in-memory only mode
      if (error instanceof Error && error.message === "Timeout") {
        console.warn(`[KeyManager] Key retrieval timed out after ${effectiveTimeout}ms, switching to in-memory mode`);

        // If we have a memory fallback key, use it
        if (this.memoryFallbackKey) {
          return this.memoryFallbackKey;
        }

        throw new KeyManagerError(
          `Key retrieval timed out after ${effectiveTimeout}ms`,
          KeyManagerErrorCode.RETRIEVAL_TIMEOUT,
        );
      }

      // Invalidate cached availability on unexpected operation failure
      this.invalidateAvailabilityCache();

      throw new KeyManagerError(
        "Failed to retrieve encryption key",
        KeyManagerErrorCode.RETRIEVAL_FAILED,
        error,
      );
    }
  }

  /**
   * Get information about the current key including rotation status
   */
  async getKeyInfo(): Promise<KeyInfo | null> {
    const key = await this.getKey();
    if (!key) {
      return null;
    }

    let createdAt = Date.now();
    try {
      const timestampStr = await this.withTimeout(
        SecureStore.getItemAsync(`${this.keyId}_timestamp`),
        this.retrievalTimeoutMs,
      );
      if (timestampStr) {
        createdAt = parseInt(timestampStr, 10);
      }
    } catch {
      // If we can't get the timestamp, assume the key needs rotation check
      console.warn("[KeyManager] Could not retrieve key timestamp");
    }

    const needsRotation = Date.now() - createdAt > KEY_ROTATION_INTERVAL_MS;

    return {
      key,
      createdAt,
      needsRotation,
    };
  }

  /**
   * Generate and store a new encryption key
   */
  private async generateAndStoreKey(): Promise<string> {
    const key = this.generateKey();
    await this.storeKey(key);

    // Store in memory as fallback
    this.memoryFallbackKey = key;

    return key;
  }

  /**
   * Rotate the encryption key (generate a new one)
   * This should be called when the key is due for rotation
   */
  async rotateKey(options: KeyRotationOptions = {}): Promise<string> {
    const oldKey = await this.getKey();
    const newKey = this.generateKey();

    if (oldKey && options.reencrypt) {
      try {
        await options.reencrypt({ oldKey, newKey });
      } catch (error) {
        console.warn(
          "[KeyManager] Key rotation deferred because cache re-encryption failed:",
          error instanceof Error ? error.message : String(error),
        );
        return oldKey;
      }
    } else if (oldKey) {
      console.warn("[KeyManager] Key rotation deferred because no re-encryption callback was provided");
      return oldKey;
    }

    await this.storeKey(newKey);
    this.memoryFallbackKey = newKey;

    console.log("[KeyManager] Key rotated successfully");
    return newKey;
  }

  /**
   * Get or create the encryption key
   * This is the primary method for obtaining the key
   */
  async getOrCreateKey(): Promise<string> {
    try {
      const existingKey = await this.getKey();
      if (existingKey) {
        return existingKey;
      }
    } catch (error) {
      // Log error but continue to generate new key
      console.warn("[KeyManager] Error retrieving key, will generate new one:", error);
    }

    // Generate and store a new key
    return this.generateAndStoreKey();
  }

  /**
   * Delete the encryption key (useful for testing or secure cleanup)
   */
  async deleteKey(): Promise<void> {
    if (!(await this.isSecureStoreAvailable())) {
      this.memoryFallbackKey = null;
      return;
    }

    try {
      await SecureStore.deleteItemAsync(this.keyId);
      await SecureStore.deleteItemAsync(`${this.keyId}_timestamp`);
    } catch (error) {
      console.warn("[KeyManager] Error deleting key:", error);
    }

    this.memoryFallbackKey = null;
  }

  /**
   * Check if secure store is available on this platform.
   * Caches the result after the initial probe to eliminate redundant per-call round trips.
   */
  async isSecureStoreAvailable(forceCheck: boolean = false): Promise<boolean> {
    if (!forceCheck && this.secureStoreAvailableCache !== null) {
      return this.secureStoreAvailableCache;
    }

    // SecureStore is available on iOS and Android
    // On web, it falls back to localStorage (not secure)
    if (Platform.OS === "web") {
      console.warn("[KeyManager] Secure store not available on web platform");
      this.secureStoreAvailableCache = false;
      return false;
    }

    try {
      // Try to check if SecureStore is available by testing a simple operation
      await SecureStore.getItemAsync("__test_availability__");
      this.secureStoreAvailableCache = true;
      return true;
    } catch {
      this.secureStoreAvailableCache = false;
      return false;
    }
  }

  /**
   * Invalidate cached availability on explicit operational failures
   */
  invalidateAvailabilityCache(): void {
    this.secureStoreAvailableCache = null;
  }

  /**
   * Calculate effective timeout based on baseline and observed latencies
   */
  getEffectiveTimeoutMs(): number {
    if (!this.adaptiveTimeout || this.observedLatencies.length === 0) {
      return this.retrievalTimeoutMs;
    }
    const recent = this.observedLatencies.slice(-5);
    const avg = recent.reduce((sum, v) => sum + v, 0) / recent.length;
    // Safety headroom: 2.5x observed average + 150ms buffer, bounded by MAX_KEY_RETRIEVAL_TIMEOUT_MS
    const adapted = Math.round(avg * 2.5 + 150);
    return Math.max(this.retrievalTimeoutMs, Math.min(MAX_KEY_RETRIEVAL_TIMEOUT_MS, adapted));
  }

  private recordRetrievalLatency(durationMs: number): void {
    this.observedLatencies.push(durationMs);
    if (this.observedLatencies.length > 20) {
      this.observedLatencies.shift();
    }
  }

  /**
   * Validate that a key has the correct format (64 hex characters for 256-bit key)
   */
  private isValidKeyFormat(key: string): boolean {
    return /^[0-9a-f]{64}$/i.test(key);
  }

  /**
   * Helper to add timeout to a promise
   */
  private withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error("Timeout"));
      }, timeoutMs);

      promise
        .then((result) => {
          clearTimeout(timeoutId);
          resolve(result);
        })
        .catch((error) => {
          clearTimeout(timeoutId);
          reject(error);
        });
    });
  }

  /**
   * Helper for sleep/delay
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// Export a singleton instance for app-wide use
export const keyManager = new KeyManager();
