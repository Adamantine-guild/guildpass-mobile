/**
 * refreshTokenStorage — dedicated secure-store facade for the refresh token.
 *
 * Verifies the refresh token lives in its own key (isolated from the session
 * JSON), and that get/set/clear round-trip correctly against an injected engine.
 */

import { describe, it, expect, vi } from "vitest";
import type { StateStorage } from "zustand/middleware";
import {
  createRefreshTokenStorage,
  REFRESH_TOKEN_KEY,
} from "../src/features/session/refreshTokenStorage";

function memoryStorage(): StateStorage & { _map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    _map: map,
    getItem: vi.fn(async (name: string) => map.get(name) ?? null),
    setItem: vi.fn(async (name: string, value: string) => {
      map.set(name, value);
    }),
    removeItem: vi.fn(async (name: string) => {
      map.delete(name);
    }),
  };
}

describe("refreshTokenStorage", () => {
  it("returns null when nothing is stored", async () => {
    const storage = createRefreshTokenStorage(memoryStorage());
    expect(await storage.get()).toBeNull();
  });

  it("writes and reads back the token under the dedicated key", async () => {
    const engine = memoryStorage();
    const storage = createRefreshTokenStorage(engine);

    await storage.set("refresh-1");

    expect(engine.setItem).toHaveBeenCalledWith(REFRESH_TOKEN_KEY, "refresh-1");
    expect(await storage.get()).toBe("refresh-1");
  });

  it("uses an isolated key distinct from the session store", () => {
    expect(REFRESH_TOKEN_KEY).toBe("session-refresh-token");
    expect(REFRESH_TOKEN_KEY).not.toBe("session-storage");
  });

  it("clears the token", async () => {
    const engine = memoryStorage();
    const storage = createRefreshTokenStorage(engine);

    await storage.set("refresh-1");
    await storage.clear();

    expect(engine.removeItem).toHaveBeenCalledWith(REFRESH_TOKEN_KEY);
    expect(await storage.get()).toBeNull();
  });

  it("rotation overwrites the previous token", async () => {
    const storage = createRefreshTokenStorage(memoryStorage());
    await storage.set("refresh-1");
    await storage.set("refresh-2");
    expect(await storage.get()).toBe("refresh-2");
  });
});
