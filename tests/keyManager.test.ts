import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Mock expo-secure-store
vi.mock("expo-secure-store", () => ({
  setItemAsync: vi.fn(),
  getItemAsync: vi.fn(),
  deleteItemAsync: vi.fn(),
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: "WHEN_UNLOCKED_THIS_DEVICE_ONLY",
}));

// Mock react-native Platform
vi.mock("react-native", () => ({
  Platform: {
    OS: "ios",
  },
}));

import * as SecureStore from "expo-secure-store";
import { KeyManager, KeyManagerErrorCode, KeyManagerError } from "../src/lib/keyManager";

describe("KeyManager", () => {
  let keyManager: KeyManager;

  beforeEach(() => {
    vi.resetAllMocks();
    // Create a new instance with a unique key ID for each test
    keyManager = new KeyManager({
      keyId: `test_key_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    });
  });

  afterEach(async () => {
    // Clean up
    try {
      await keyManager.deleteKey();
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("generateKey", () => {
    it("should generate a valid 256-bit (64 hex character) key", async () => {
      // Mock secure store as available
      vi.mocked(SecureStore.getItemAsync).mockResolvedValue(null);
      vi.mocked(SecureStore.setItemAsync).mockResolvedValue();

      const key = await keyManager.getOrCreateKey();

      // Key should be 64 hex characters (256 bits = 32 bytes = 64 hex chars)
      expect(key).toMatch(/^[0-9a-f]{64}$/i);
      expect(key.length).toBe(64);
    });

    it("should generate unique keys on each call", async () => {
      vi.mocked(SecureStore.getItemAsync).mockResolvedValue(null);
      vi.mocked(SecureStore.setItemAsync).mockResolvedValue();

      const key1 = await keyManager.getOrCreateKey();
      
      // Create a new KeyManager instance to simulate fresh start
      const keyManager2 = new KeyManager({
        keyId: `test_key_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      });
      vi.mocked(SecureStore.getItemAsync).mockResolvedValue(null);
      const key2 = await keyManager2.getOrCreateKey();

      expect(key1).not.toBe(key2);
    });

    it("should generate cryptographically random keys (distribution check)", async () => {
      vi.mocked(SecureStore.getItemAsync).mockResolvedValue(null);
      vi.mocked(SecureStore.setItemAsync).mockResolvedValue();

      // Generate multiple keys and check they're all unique
      const keys = new Set<string>();
      for (let i = 0; i < 10; i++) {
        const km = new KeyManager({
          keyId: `test_key_${i}_${Date.now()}`,
        });
        vi.mocked(SecureStore.getItemAsync).mockResolvedValue(null);
        vi.mocked(SecureStore.setItemAsync).mockResolvedValue();
        const key = await km.getOrCreateKey();
        keys.add(key);
      }

      // All keys should be unique
      expect(keys.size).toBe(10);
    });
  });

  describe("storeKey", () => {
    it("should store key in secure store with correct access controls", async () => {
      vi.mocked(SecureStore.getItemAsync).mockResolvedValue(null);
      vi.mocked(SecureStore.setItemAsync).mockResolvedValue();

      await keyManager.getOrCreateKey();

      // Should have called setItemAsync with correct options
      expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringMatching(/^[0-9a-f]{64}$/i),
        { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY }
      );
    });

    it("should store key timestamp for rotation tracking", async () => {
      vi.mocked(SecureStore.getItemAsync).mockResolvedValue(null);
      vi.mocked(SecureStore.setItemAsync).mockResolvedValue();

      await keyManager.getOrCreateKey();

      // Should have stored timestamp
      const calls = vi.mocked(SecureStore.setItemAsync).mock.calls;
      const timestampCall = calls.find(call => 
        call[0].includes("timestamp")
      );
      expect(timestampCall).toBeDefined();
    });

    it("should retry on storage failure with exponential backoff", async () => {
      vi.mocked(SecureStore.getItemAsync).mockResolvedValue(null);
      
      // Fail first two attempts, succeed on third
      // Note: setItemAsync is called twice per attempt (key + timestamp)
      vi.mocked(SecureStore.setItemAsync)
        .mockRejectedValueOnce(new Error("Storage failed"))
        .mockRejectedValueOnce(new Error("Storage failed"))
        .mockRejectedValueOnce(new Error("Storage failed"))
        .mockRejectedValueOnce(new Error("Storage failed"))
        .mockResolvedValueOnce()
        .mockResolvedValueOnce();

      const km = new KeyManager({
        keyId: `test_key_retry_${Date.now()}`,
        maxRetries: 3,
      });

      // Should succeed after retries
      await km.getOrCreateKey();

      // 3 failed attempts * 2 calls each + 1 successful attempt * 2 calls = 8 calls
      expect(SecureStore.setItemAsync).toHaveBeenCalledTimes(8);
    });

    it("should throw STORAGE_FAILED after max retries exceeded", async () => {
      vi.mocked(SecureStore.getItemAsync).mockResolvedValue(null);
      vi.mocked(SecureStore.setItemAsync).mockRejectedValue(new Error("Storage failed"));

      const km = new KeyManager({
        keyId: `test_key_fail_${Date.now()}`,
        maxRetries: 3,
      });

      await expect(km.getOrCreateKey()).rejects.toThrow(KeyManagerError);
      await expect(km.getOrCreateKey()).rejects.toMatchObject({
        code: KeyManagerErrorCode.STORAGE_FAILED,
      });
    });
  });

  describe("getKey", () => {
    it("should retrieve existing key from secure store", async () => {
      const testKey = "a".repeat(64); // 64 hex characters
      vi.mocked(SecureStore.getItemAsync).mockResolvedValue(testKey);

      const key = await keyManager.getKey();

      expect(key).toBe(testKey);
    });

    it("should return null when key does not exist", async () => {
      vi.mocked(SecureStore.getItemAsync).mockResolvedValue(null);

      const key = await keyManager.getKey();

      expect(key).toBeNull();
    });

    it("should throw RETRIEVAL_TIMEOUT when retrieval exceeds timeout", async () => {
      // Mock a slow retrieval
      vi.mocked(SecureStore.getItemAsync).mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve("key"), 200))
      );

      const km = new KeyManager({
        keyId: `test_key_timeout_${Date.now()}`,
        retrievalTimeoutMs: 50, // 50ms timeout
      });

      await expect(km.getKey()).rejects.toThrow(KeyManagerError);
      await expect(km.getKey()).rejects.toMatchObject({
        code: KeyManagerErrorCode.RETRIEVAL_TIMEOUT,
      });
    });

    it("should throw INVALID_KEY_FORMAT when stored key is malformed", async () => {
      vi.mocked(SecureStore.getItemAsync).mockResolvedValue("invalid-key");

      await expect(keyManager.getKey()).rejects.toThrow(KeyManagerError);
      await expect(keyManager.getKey()).rejects.toMatchObject({
        code: KeyManagerErrorCode.INVALID_KEY_FORMAT,
      });
    });
  });

  describe("getKeyInfo", () => {
    it("should return null when no key exists", async () => {
      vi.mocked(SecureStore.getItemAsync).mockResolvedValue(null);

      const info = await keyManager.getKeyInfo();

      expect(info).toBeNull();
    });

    it("should return key info with creation timestamp", async () => {
      const testKey = "b".repeat(64);
      const timestamp = Date.now() - 1000; // 1 second ago
      
      vi.mocked(SecureStore.getItemAsync)
        .mockImplementation(async (keyId: string) => {
          if (keyId.includes("timestamp")) {
            return timestamp.toString();
          }
          return testKey;
        });

      const info = await keyManager.getKeyInfo();

      expect(info).toEqual({
        key: testKey,
        createdAt: timestamp,
        needsRotation: false,
      });
    });

    it("should indicate when key needs rotation (older than 30 days)", async () => {
      const testKey = "c".repeat(64);
      const thirtyOneDaysAgo = Date.now() - (31 * 24 * 60 * 60 * 1000);
      
      vi.mocked(SecureStore.getItemAsync)
        .mockImplementation(async (keyId: string) => {
          if (keyId.includes("timestamp")) {
            return thirtyOneDaysAgo.toString();
          }
          return testKey;
        });

      const info = await keyManager.getKeyInfo();

      expect(info?.needsRotation).toBe(true);
    });
  });

  describe("rotateKey", () => {
    it("should generate a new key different from the previous one", async () => {
      const oldKey = "d".repeat(64);
      vi.mocked(SecureStore.getItemAsync)
        .mockImplementation(async (keyId: string) => {
          if (keyId.includes("timestamp")) {
            return Date.now().toString();
          }
          return oldKey;
        });
      vi.mocked(SecureStore.setItemAsync).mockResolvedValue();

      const newKey = await keyManager.rotateKey();

      expect(newKey).not.toBe(oldKey);
      expect(newKey).toMatch(/^[0-9a-f]{64}$/i);
    });

    it("should store new key in secure store", async () => {
      vi.mocked(SecureStore.getItemAsync).mockResolvedValue("e".repeat(64));
      vi.mocked(SecureStore.setItemAsync).mockResolvedValue();

      await keyManager.rotateKey();

      expect(SecureStore.setItemAsync).toHaveBeenCalled();
    });
  });

  describe("getOrCreateKey", () => {
    it("should return existing key if available", async () => {
      const existingKey = "f".repeat(64);
      vi.mocked(SecureStore.getItemAsync).mockResolvedValue(existingKey);

      const key = await keyManager.getOrCreateKey();

      expect(key).toBe(existingKey);
      // Should not have stored a new key
      expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
    });

    it("should generate and store new key if none exists", async () => {
      vi.mocked(SecureStore.getItemAsync).mockResolvedValue(null);
      vi.mocked(SecureStore.setItemAsync).mockResolvedValue();

      const key = await keyManager.getOrCreateKey();

      expect(key).toMatch(/^[0-9a-f]{64}$/i);
      expect(SecureStore.setItemAsync).toHaveBeenCalled();
    });
  });

  describe("deleteKey", () => {
    it("should delete key from secure store", async () => {
      vi.mocked(SecureStore.deleteItemAsync).mockResolvedValue();

      await keyManager.deleteKey();

      expect(SecureStore.deleteItemAsync).toHaveBeenCalled();
    });

    it("should clear memory fallback key", async () => {
      vi.mocked(SecureStore.getItemAsync).mockResolvedValue(null);
      vi.mocked(SecureStore.setItemAsync).mockResolvedValue();
      vi.mocked(SecureStore.deleteItemAsync).mockResolvedValue();

      // Generate and store a key
      await keyManager.getOrCreateKey();
      
      // Delete it
      await keyManager.deleteKey();
      
      // Verify key is gone
      vi.mocked(SecureStore.getItemAsync).mockResolvedValue(null);
      const key = await keyManager.getKey();
      expect(key).toBeNull();
    });
  });

  describe("isSecureStoreAvailable", () => {
    it("should return true on iOS platform", async () => {
      vi.mocked(SecureStore.getItemAsync).mockResolvedValue(null);

      const available = await keyManager.isSecureStoreAvailable();

      expect(available).toBe(true);
    });

    it("should return false when secure store operations fail", async () => {
      vi.mocked(SecureStore.getItemAsync).mockRejectedValue(new Error("Not available"));

      const available = await keyManager.isSecureStoreAvailable();

      expect(available).toBe(false);
    });
  });

  describe("initialize", () => {
    it("should generate key if none exists", async () => {
      vi.mocked(SecureStore.getItemAsync).mockResolvedValue(null);
      vi.mocked(SecureStore.setItemAsync).mockResolvedValue();

      await keyManager.initialize();

      expect(SecureStore.setItemAsync).toHaveBeenCalled();
    });

    it("should not generate new key if one exists", async () => {
      vi.mocked(SecureStore.getItemAsync)
        .mockImplementation(async (keyId: string) => {
          if (keyId.includes("timestamp")) {
            return Date.now().toString();
          }
          return "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
        });

      await keyManager.initialize();

      expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
    });

    it("should rotate key if it needs rotation", async () => {
      const oldKey = "h".repeat(64);
      const thirtyOneDaysAgo = Date.now() - (31 * 24 * 60 * 60 * 1000);
      
      vi.mocked(SecureStore.getItemAsync)
        .mockImplementation(async (keyId: string) => {
          if (keyId.includes("timestamp")) {
            return thirtyOneDaysAgo.toString();
          }
          return oldKey;
        });
      vi.mocked(SecureStore.setItemAsync).mockResolvedValue();

      await keyManager.initialize();

      // Should have stored a new key (rotation)
      expect(SecureStore.setItemAsync).toHaveBeenCalled();
    });
  });

  describe("KeyManagerError", () => {
    it("should have correct error code and message", () => {
      const error = new KeyManagerError(
        "Test error message",
        KeyManagerErrorCode.GENERATION_FAILED
      );

      expect(error.message).toBe("Test error message");
      expect(error.code).toBe(KeyManagerErrorCode.GENERATION_FAILED);
      expect(error.name).toBe("KeyManagerError");
    });

    it("should include original error if provided", () => {
      const originalError = new Error("Original error");
      const error = new KeyManagerError(
        "Test error",
        KeyManagerErrorCode.STORAGE_FAILED,
        originalError
      );

      expect(error.originalError).toBe(originalError);
    });
  });
});
