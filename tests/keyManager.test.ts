import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as SecureStore from 'expo-secure-store';
import { KeyManager, KeyManagerError, KeyManagerErrorCode } from '../src/lib/keyManager';

vi.mock('expo-secure-store', () => ({
  getItemAsync: vi.fn(),
  setItemAsync: vi.fn(),
  deleteItemAsync: vi.fn(),
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY',
}));

describe('KeyManager', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // Intercept internal async side-effects on the prototype globally
    // @ts-expect-error - stubbing private method
    vi.spyOn(KeyManager.prototype, 'sleep').mockResolvedValue(undefined);
    // @ts-expect-error - stubbing private method
    vi.spyOn(KeyManager.prototype, 'isSecureStoreAvailable').mockResolvedValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('generateKey', () => {
    it('should generate a valid 256-bit (64 hex character) key', () => {
      const km = new KeyManager({ keyId: 'test_gen_1' });
      // @ts-expect-error - testing private method
      const key = km.generateKey();
      expect(key).toHaveLength(64);
      expect(key).toMatch(/^[0-9a-fA-F]{64}$/);
    });

    it('should generate unique keys on each call', () => {
      const km = new KeyManager({ keyId: 'test_gen_2' });
      // @ts-expect-error - testing private method
      const key1 = km.generateKey();
      // @ts-expect-error - testing private method
      const key2 = km.generateKey();
      expect(key1).not.toBe(key2);
    });
  });

  describe('storeKey', () => {
    it('should store key in secure store with correct access controls', async () => {
      vi.mocked(SecureStore.setItemAsync).mockResolvedValue();
      const km = new KeyManager({ keyId: 'test_store_1' });
      
      // @ts-expect-error - testing private method
      await km.storeKey('a'.repeat(64));
      expect(SecureStore.setItemAsync).toHaveBeenCalledWith('test_store_1', 'a'.repeat(64), expect.any(Object));
    });

    it('should retry on storage failure with exponential backoff', async () => {
      vi.mocked(SecureStore.setItemAsync)
        .mockRejectedValueOnce(new Error('Storage failed'))
        .mockResolvedValueOnce();

      const km = new KeyManager({ keyId: 'test_key_retry' });
      // @ts-expect-error - testing private method
      await km.storeKey('c'.repeat(64));
      expect(SecureStore.setItemAsync).toHaveBeenCalledTimes(3);
    });

    it('should throw STORAGE_FAILED after max retries exceeded', async () => {
      vi.mocked(SecureStore.setItemAsync).mockRejectedValue(new Error('Storage failed'));
      const km = new KeyManager({ keyId: 'test_key_fail' });

      // @ts-expect-error - testing private method
      await expect(km.storeKey('d'.repeat(64))).rejects.toThrowError(
        expect.objectContaining({ code: KeyManagerErrorCode.STORAGE_FAILED })
      );
    });
  });

  describe('getKey', () => {
    it('should retrieve existing key from secure store', async () => {
      const validKey = 'c'.repeat(64);
      vi.mocked(SecureStore.getItemAsync).mockResolvedValue(validKey);
      
      const km = new KeyManager({ keyId: 'test_get_1' });
      const retrieved = await km.getKey();
      expect(retrieved).toBe(validKey);
    });

    it('should return null when key does not exist', async () => {
      vi.mocked(SecureStore.getItemAsync).mockResolvedValue(null);
      const km = new KeyManager({ keyId: 'test_get_2' });
      expect(await km.getKey()).toBeNull();
    });

    it('should throw RETRIEVAL_TIMEOUT when retrieval exceeds timeout', async () => {
      // Force withTimeout to reject instantly with the exact string message checked by the source
      // @ts-expect-error - stubbing private method
      vi.spyOn(KeyManager.prototype, 'withTimeout').mockRejectedValue(new Error('Timeout'));

      const km = new KeyManager({ keyId: 'test_get_timeout' });
      await expect(km.getKey()).rejects.toThrowError(
        expect.objectContaining({ code: KeyManagerErrorCode.RETRIEVAL_TIMEOUT })
      );
    });

    it('should throw INVALID_KEY_FORMAT when stored key is malformed', async () => {
      vi.mocked(SecureStore.getItemAsync).mockResolvedValue('short-key');
      const km = new KeyManager({ keyId: 'test_get_4' });
      await expect(km.getKey()).rejects.toThrowError(
        expect.objectContaining({ code: KeyManagerErrorCode.INVALID_KEY_FORMAT })
      );
    });
  });

  describe('getKeyInfo', () => {
    it('should return key info with creation timestamp', async () => {
      const validKey = 'd'.repeat(64);
      const nowStr = Date.now().toString();
      vi.mocked(SecureStore.getItemAsync).mockImplementation(async (key) => {
        return key.endsWith('_timestamp') ? nowStr : validKey;
      });

      const km = new KeyManager({ keyId: 'test_info_2' });
      const info = await km.getKeyInfo();
      expect(info).not.toBeNull();
      expect(info?.createdAt).toBe(parseInt(nowStr, 10));
      expect(info?.needsRotation).toBe(false);
    });

    it('should indicate when key needs rotation (older than 30 days)', async () => {
      const validKey = 'e'.repeat(64);
      const oldTimestamp = (Date.now() - (35 * 24 * 60 * 60 * 1000)).toString();
      vi.mocked(SecureStore.getItemAsync).mockImplementation(async (key) => {
        return key.endsWith('_timestamp') ? oldTimestamp : validKey;
      });

      const km = new KeyManager({ keyId: 'test_info_3' });
      const info = await km.getKeyInfo();
      expect(info?.needsRotation).toBe(true);
    });
  });

  describe('rotateKey', () => {
    it('should generate a new key different from the previous one', async () => {
      vi.mocked(SecureStore.getItemAsync).mockResolvedValue('f'.repeat(64));
      vi.mocked(SecureStore.setItemAsync).mockResolvedValue();

      const km = new KeyManager({ keyId: 'test_rotate_1' });
      const newKey = await km.rotateKey();
      expect(newKey).not.toBe('f'.repeat(64));
    });
  });

  describe('getOrCreateKey', () => {
    it('should return existing key if available', async () => {
      const existing = '1'.repeat(64);
      vi.mocked(SecureStore.getItemAsync).mockResolvedValue(existing);
      
      const km = new KeyManager({ keyId: 'test_goc_1' });
      expect(await km.getOrCreateKey()).toBe(existing);
    });
  });

  describe('deleteKey', () => {
    it('should delete key from secure store', async () => {
      vi.mocked(SecureStore.deleteItemAsync).mockResolvedValue();
      const km = new KeyManager({ keyId: 'test_del_1' });
      await km.deleteKey();
      expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('test_del_1');
    });
  });

  describe('initialize', () => {
    it('should generate key if none exists', async () => {
      vi.mocked(SecureStore.getItemAsync).mockResolvedValue(null);
      vi.mocked(SecureStore.setItemAsync).mockResolvedValue();

      const km = new KeyManager({ keyId: 'test_init_1' });
      await km.initialize();
      expect(SecureStore.setItemAsync).toHaveBeenCalled();
    });

    it('should not generate new key if one exists and is fresh', async () => {
      const validKey = '2'.repeat(64);
      const nowStr = Date.now().toString();
      vi.mocked(SecureStore.getItemAsync).mockImplementation(async (key) => {
        return key.endsWith('_timestamp') ? nowStr : validKey;
      });

      const km = new KeyManager({ keyId: 'test_init_2' });
      await km.initialize();
      expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
    });
  });

  describe('KeyManagerError', () => {
    it('should have correct error code and message', () => {
      const err = new KeyManagerError('Custom text', KeyManagerErrorCode.INVALID_KEY_FORMAT);
      expect(err.code).toBe(KeyManagerErrorCode.INVALID_KEY_FORMAT);
      expect(err.message).toBe('Custom text');
    });
  });
});