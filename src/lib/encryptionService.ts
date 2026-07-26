/**
 * EncryptionService provides AES-GCM-256 encryption/decryption operations for the offline cache.
 *
 * **Validates: Requirements 1.1, 1.2, 1.4, 1.6**
 *
 * @remarks
 * - Uses AES-GCM-256 with 12-byte nonce and 16-byte authentication tag
 * - Includes tamper detection and authentication failure handling
 * - Maintains data integrity with round-trip verification
 * - Performance target: <50ms for 10KB payloads
 */

// Error types for encryption/decryption failures
export class EncryptionError extends Error {
  constructor(
    message: string,
    public readonly code: EncryptionErrorCode,
  ) {
    super(message);
    this.name = "EncryptionError";
  }
}

export type EncryptionErrorCode =
  | "INVALID_KEY"
  | "INVALID_DATA"
  | "AUTHENTICATION_FAILED"
  | "DECRYPTION_FAILED"
  | "ENCRYPTION_FAILED"
  | "PERFORMANCE_TIMEOUT";

export interface EncryptionResult {
  encrypted: ArrayBuffer;
  nonce: Uint8Array; // 12 bytes for AES-GCM
  authTag: Uint8Array; // 16 bytes for AES-GCM
  performanceMs: number;
}

export interface DecryptionResult<T = any> {
  decrypted: T;
  performanceMs: number;
}

export interface PerformanceMetrics {
  encryptionTimeMs: number;
  decryptionTimeMs: number;
  totalOperations: number;
  averageEncryptionTimeMs: number;
  averageDecryptionTimeMs: number;
}

/**
 * EncryptionService class providing AES-GCM-256 encryption/decryption operations.
 *
 * Requirements validated:
 * - 1.1: Encrypt data with device-bound key using AES-GCM-256
 * - 1.2: Decrypt data with authentication verification
 * - 1.4: Maintain data integrity with round-trip verification
 * - 1.6: Reject tampered encrypted data with authentication failure errors
 */
export class EncryptionService {
  private readonly ALGORITHM = "AES-GCM";
  private readonly KEY_LENGTH = 256;
  private readonly NONCE_LENGTH = 12; // 12 bytes for AES-GCM
  private readonly AUTH_TAG_LENGTH = 16; // 16 bytes for AES-GCM
  private readonly PERFORMANCE_TIMEOUT_MS = 100; // Fail after 100ms (double the 50ms target for safety)

  private performanceMetrics: PerformanceMetrics = {
    encryptionTimeMs: 0,
    decryptionTimeMs: 0,
    totalOperations: 0,
    averageEncryptionTimeMs: 0,
    averageDecryptionTimeMs: 0,
  };

  /**
   * Encrypt data using AES-GCM-256.
   *
   * @param data - The data to encrypt (string or ArrayBuffer)
   * @param key - The encryption key as ArrayBuffer or CryptoKey
   * @returns Promise<EncryptionResult> containing encrypted data, nonce, auth tag, and performance metrics
   * @throws {EncryptionError} If encryption fails, key is invalid, or performance timeout exceeded
   */
  async encrypt(
    data: string | ArrayBuffer,
    key: ArrayBuffer | CryptoKey,
  ): Promise<EncryptionResult> {
    const startTime = performance.now();

    try {
      // Validate inputs
      if (!data) {
        throw new EncryptionError("Data cannot be empty", "INVALID_DATA");
      }

      // Convert string data to ArrayBuffer if needed
      const dataBuffer = typeof data === "string" ? this.stringToArrayBuffer(data) : data;

      // Validate key
      const cryptoKey = await this.normalizeKey(key);

      // Generate random nonce (12 bytes for AES-GCM)
      const nonce = crypto.getRandomValues(new Uint8Array(this.NONCE_LENGTH));

      // Set up encryption parameters
      const algorithm = {
        name: this.ALGORITHM,
        iv: nonce,
        tagLength: this.AUTH_TAG_LENGTH * 8, // Convert bytes to bits
      };

      // Perform encryption
      const encrypted = await crypto.subtle.encrypt(algorithm, cryptoKey, dataBuffer);

      // Extract authentication tag (last 16 bytes of encrypted data)
      const authTag = new Uint8Array(encrypted.slice(-this.AUTH_TAG_LENGTH));

      // Remove auth tag from encrypted data (it's included in the result)
      const encryptedWithoutTag = encrypted.slice(0, -this.AUTH_TAG_LENGTH);

      const endTime = performance.now();
      const performanceMs = endTime - startTime;

      // Check performance threshold
      if (performanceMs > this.PERFORMANCE_TIMEOUT_MS) {
        throw new EncryptionError(
          `Encryption exceeded performance timeout: ${performanceMs.toFixed(2)}ms`,
          "PERFORMANCE_TIMEOUT",
        );
      }

      // Update performance metrics
      this.updatePerformanceMetrics("encrypt", performanceMs);

      return {
        encrypted: encryptedWithoutTag,
        nonce,
        authTag,
        performanceMs,
      };
    } catch (error) {
      const endTime = performance.now();
      const performanceMs = endTime - startTime;

      if (error instanceof EncryptionError) {
        throw error;
      }

      throw new EncryptionError(
        `Encryption failed: ${error instanceof Error ? error.message : String(error)}`,
        "ENCRYPTION_FAILED",
      );
    }
  }

  /**
   * Decrypt data using AES-GCM-256 with authentication verification.
   *
   * @param encrypted - The encrypted data (ArrayBuffer)
   * @param nonce - The 12-byte nonce used during encryption
   * @param authTag - The 16-byte authentication tag
   * @param key - The decryption key as ArrayBuffer or CryptoKey
   * @returns Promise<DecryptionResult<T>> containing decrypted data and performance metrics
   * @throws {EncryptionError} If decryption fails, authentication fails, or performance timeout exceeded
   */
  async decrypt<T = any>(
    encrypted: ArrayBuffer,
    nonce: Uint8Array,
    authTag: Uint8Array,
    key: ArrayBuffer | CryptoKey,
  ): Promise<DecryptionResult<T>> {
    const startTime = performance.now();

    try {
      // Validate inputs
      if (!encrypted || encrypted.byteLength === 0) {
        throw new EncryptionError("Encrypted data cannot be empty", "INVALID_DATA");
      }

      if (!nonce || nonce.length !== this.NONCE_LENGTH) {
        throw new EncryptionError(`Nonce must be ${this.NONCE_LENGTH} bytes`, "INVALID_DATA");
      }

      if (!authTag || authTag.length !== this.AUTH_TAG_LENGTH) {
        throw new EncryptionError(
          `Authentication tag must be ${this.AUTH_TAG_LENGTH} bytes`,
          "INVALID_DATA",
        );
      }

      // Validate key
      const cryptoKey = await this.normalizeKey(key);

      // Combine encrypted data with auth tag for decryption
      const encryptedWithTag = new Uint8Array(encrypted.byteLength + authTag.length);
      encryptedWithTag.set(new Uint8Array(encrypted), 0);
      encryptedWithTag.set(authTag, encrypted.byteLength);

      // Set up decryption parameters
      const algorithm = {
        name: this.ALGORITHM,
        iv: nonce,
        tagLength: this.AUTH_TAG_LENGTH * 8,
      };

      // Perform decryption (this will verify the authentication tag)
      const decryptedBuffer = await crypto.subtle.decrypt(algorithm, cryptoKey, encryptedWithTag);

      // Convert ArrayBuffer back to original type
      const decrypted = this.arrayBufferToString(decryptedBuffer);

      // Parse JSON if it looks like JSON (for cache data)
      let parsedData: T;
      try {
        parsedData = JSON.parse(decrypted) as T;
      } catch {
        // If not JSON, return as string
        parsedData = decrypted as T;
      }

      const endTime = performance.now();
      const performanceMs = endTime - startTime;

      // Check performance threshold
      if (performanceMs > this.PERFORMANCE_TIMEOUT_MS) {
        throw new EncryptionError(
          `Decryption exceeded performance timeout: ${performanceMs.toFixed(2)}ms`,
          "PERFORMANCE_TIMEOUT",
        );
      }

      // Update performance metrics
      this.updatePerformanceMetrics("decrypt", performanceMs);

      return {
        decrypted: parsedData,
        performanceMs,
      };
    } catch (error) {
      const endTime = performance.now();
      const performanceMs = endTime - startTime;

      // Check for authentication failure specifically
      if (error instanceof DOMException && error.name === "OperationError") {
        throw new EncryptionError(
          "Authentication failed: tampered or corrupted data detected",
          "AUTHENTICATION_FAILED",
        );
      }

      if (error instanceof EncryptionError) {
        throw error;
      }

      throw new EncryptionError(
        `Decryption failed: ${error instanceof Error ? error.message : String(error)}`,
        "DECRYPTION_FAILED",
      );
    }
  }

  /**
   * Encrypt and immediately decrypt data to verify round-trip integrity.
   *
   * @param data - The data to test
   * @param key - The encryption key
   * @returns Promise<boolean> True if encryption/decryption round-trip succeeds with byte-for-byte accuracy
   */
  async verifyRoundTripIntegrity(data: string, key: ArrayBuffer | CryptoKey): Promise<boolean> {
    try {
      // Encrypt the data
      const { encrypted, nonce, authTag } = await this.encrypt(data, key);

      // Decrypt the data
      const { decrypted } = await this.decrypt(encrypted, nonce, authTag, key);

      // Verify byte-for-byte accuracy
      return data === decrypted;
    } catch (error) {
      return false;
    }
  }

  /**
   * Generate a new cryptographically secure AES-GCM-256 key.
   *
   * @returns Promise<CryptoKey> A new AES-GCM-256 key
   */
  async generateKey(): Promise<CryptoKey> {
    return crypto.subtle.generateKey(
      {
        name: this.ALGORITHM,
        length: this.KEY_LENGTH,
      },
      true, // extractable
      ["encrypt", "decrypt"],
    );
  }

  /**
   * Import a raw key from ArrayBuffer.
   *
   * @param keyBuffer - The raw key as ArrayBuffer
   * @returns Promise<CryptoKey> Imported CryptoKey
   */
  async importKey(keyBuffer: ArrayBuffer): Promise<CryptoKey> {
    return crypto.subtle.importKey(
      "raw",
      keyBuffer,
      {
        name: this.ALGORITHM,
        length: this.KEY_LENGTH,
      },
      true, // extractable
      ["encrypt", "decrypt"],
    );
  }

  /**
   * Export a CryptoKey to raw ArrayBuffer.
   *
   * @param key - The CryptoKey to export
   * @returns Promise<ArrayBuffer> Raw key bytes
   */
  async exportKey(key: CryptoKey): Promise<ArrayBuffer> {
    return crypto.subtle.exportKey("raw", key);
  }

  /**
   * Get current performance metrics.
   *
   * @returns PerformanceMetrics Current performance statistics
   */
  getPerformanceMetrics(): PerformanceMetrics {
    return { ...this.performanceMetrics };
  }

  /**
   * Reset performance metrics.
   */
  resetPerformanceMetrics(): void {
    this.performanceMetrics = {
      encryptionTimeMs: 0,
      decryptionTimeMs: 0,
      totalOperations: 0,
      averageEncryptionTimeMs: 0,
      averageDecryptionTimeMs: 0,
    };
  }

  /**
   * Validate that a key is suitable for encryption/decryption.
   *
   * @param key - The key to validate
   * @returns Promise<boolean> True if key is valid
   */
  async validateKey(key: ArrayBuffer | CryptoKey): Promise<boolean> {
    try {
      const cryptoKey = await this.normalizeKey(key);
      return (
        cryptoKey.algorithm.name === this.ALGORITHM &&
        (cryptoKey.algorithm as any).length === this.KEY_LENGTH
      );
    } catch {
      return false;
    }
  }

  // Private helper methods

  private async normalizeKey(key: ArrayBuffer | CryptoKey): Promise<CryptoKey> {
    if (key instanceof CryptoKey) {
      // Validate CryptoKey properties
      if (key.algorithm.name !== this.ALGORITHM) {
        throw new EncryptionError(
          `Key algorithm must be ${this.ALGORITHM}, got ${key.algorithm.name}`,
          "INVALID_KEY",
        );
      }

      if (!key.usages.includes("encrypt") || !key.usages.includes("decrypt")) {
        throw new EncryptionError(
          "Key must support both encrypt and decrypt operations",
          "INVALID_KEY",
        );
      }

      return key;
    } else {
      // Import raw key from ArrayBuffer
      if (!key || key.byteLength !== this.KEY_LENGTH / 8) {
        throw new EncryptionError(
          `Key must be ${this.KEY_LENGTH / 8} bytes (${this.KEY_LENGTH} bits)`,
          "INVALID_KEY",
        );
      }

      return this.importKey(key);
    }
  }

  private stringToArrayBuffer(str: string): ArrayBuffer {
    const encoder = new TextEncoder();
    return encoder.encode(str).buffer;
  }

  private arrayBufferToString(buffer: ArrayBuffer): string {
    const decoder = new TextDecoder();
    return decoder.decode(buffer);
  }

  private updatePerformanceMetrics(operation: "encrypt" | "decrypt", timeMs: number): void {
    if (operation === "encrypt") {
      this.performanceMetrics.encryptionTimeMs += timeMs;
    } else {
      this.performanceMetrics.decryptionTimeMs += timeMs;
    }

    this.performanceMetrics.totalOperations++;

    // Update averages
    const encryptCount =
      this.performanceMetrics.totalOperations - this.performanceMetrics.totalOperations / 2;
    const decryptCount = this.performanceMetrics.totalOperations / 2;

    if (encryptCount > 0) {
      this.performanceMetrics.averageEncryptionTimeMs =
        this.performanceMetrics.encryptionTimeMs / encryptCount;
    }

    if (decryptCount > 0) {
      this.performanceMetrics.averageDecryptionTimeMs =
        this.performanceMetrics.decryptionTimeMs / decryptCount;
    }
  }
}

/**
 * Factory function to create a singleton EncryptionService instance.
 *
 * @returns EncryptionService Singleton instance
 */
export function createEncryptionService(): EncryptionService {
  return new EncryptionService();
}
