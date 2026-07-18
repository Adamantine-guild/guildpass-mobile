import type { StateStorage } from "zustand/middleware";
import { secureStorage } from "../../lib/storage";

/**
 * Dedicated secure storage for the refresh token.
 *
 * The refresh token is the most sensitive credential in the session — it can mint
 * new access tokens. It is kept OUT of the zustand session JSON (which also holds
 * the access token and is rehydrated eagerly) and in its own `expo-secure-store`
 * key, so:
 *   - it is never serialized alongside less-sensitive state,
 *   - rotation is a single atomic write to one key,
 *   - logout revocation clears exactly this one value.
 *
 * The storage engine is injectable so the facade is unit-testable against a mock.
 */

export const REFRESH_TOKEN_KEY = "session-refresh-token";

export interface RefreshTokenStorage {
  get(): Promise<string | null>;
  set(token: string): Promise<void>;
  clear(): Promise<void>;
}

export function createRefreshTokenStorage(storage: StateStorage = secureStorage): RefreshTokenStorage {
  return {
    async get() {
      const value = await storage.getItem(REFRESH_TOKEN_KEY);
      return value ?? null;
    },
    async set(token: string) {
      await storage.setItem(REFRESH_TOKEN_KEY, token);
    },
    async clear() {
      await storage.removeItem(REFRESH_TOKEN_KEY);
    },
  };
}
