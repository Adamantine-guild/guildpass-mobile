/**
 * Session store — transparent refresh + refresh-token rotation + revocation.
 *
 * These are the acceptance-criteria tests called out in the issue:
 *   - expired access tokens trigger a transparent refresh (no user interruption),
 *   - refresh tokens rotate on every refresh,
 *   - logout revokes the refresh token.
 *
 * Uses an injected refresh-token store so rotation/revocation are observable.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { useSessionStore } from "../src/features/session/session.store";
import { SessionAdapter } from "../src/features/session/session.types";
import { createRefreshTokenStorage } from "../src/features/session/refreshTokenStorage";
import { noopSessionAdapter } from "../src/features/session/session.adapter";

const ADDR = "0x1234567890123456789012345678901234567890";

function siweLikeAdapter(storage: ReturnType<typeof createRefreshTokenStorage>): SessionAdapter {
  return {
    async signIn(address: string) {
      await storage.set(`rt::${address}`);
      // Generous TTL so a fresh token is not considered expired by the time the
      // (async) getValidAccessToken call runs within the same test tick.
      return { accessToken: `access::${address}`, expiresAt: Date.now() + 60_000 };
    },
    async refresh() {
      const rt = await storage.get();
      if (!rt) throw new Error("NO_REFRESH_TOKEN");
      await storage.set(`${rt}::rotated`);
      return { accessToken: "access::refreshed", expiresAt: Date.now() + 2000 };
    },
    async signOut() {
      const rt = await storage.get();
      if (rt) await storage.clear();
    },
    async clearRefreshToken() {
      await storage.clear();
    },
  };
}

function reset(storage: ReturnType<typeof createRefreshTokenStorage>) {
  useSessionStore.setState({
    status: "unauthenticated",
    walletAddress: null,
    accessToken: null,
    expiresAt: null,
    reAuthRequired: false,
    adapter: noopSessionAdapter,
  });
}

describe("session store — transparent refresh on expiry", () => {
  let storage: ReturnType<typeof createRefreshTokenStorage>;
  beforeEach(() => {
    storage = createRefreshTokenStorage();
    reset(storage);
    useSessionStore.getState().setAdapter(siweLikeAdapter(storage));
  });

  it("getValidAccessToken refreshes an expired token once, transparently", async () => {
    await useSessionStore.getState().startSession(ADDR); // accessToken expires in 1s
    // Force expiry.
    useSessionStore.setState({ expiresAt: Date.now() - 1 });

    const token = await useSessionStore.getState().getValidAccessToken();

    expect(token).toBe("access::refreshed");
    expect(useSessionStore.getState().status).toBe("authenticated");
    expect(useSessionStore.getState().reAuthRequired).toBe(false);
  });

  it("getValidAccessToken returns the token without refreshing when still fresh", async () => {
    await useSessionStore.getState().startSession(ADDR);
    expect(await useSessionStore.getState().getValidAccessToken()).toBe(`access::${ADDR}`);
  });

  it("a 401 path via refreshSession flips to expired + reAuthRequired when refresh fails", async () => {
    const failingAdapter: SessionAdapter = {
      async signIn() {
        return { accessToken: "a", expiresAt: Date.now() + 1000 };
      },
      async refresh() {
        throw new Error("rotation rejected");
      },
      async signOut() {},
      async clearRefreshToken() {},
    };
    useSessionStore.getState().setAdapter(failingAdapter);
    await useSessionStore.getState().startSession(ADDR);
    await useSessionStore.getState().refreshSession();

    expect(useSessionStore.getState().status).toBe("expired");
    expect(useSessionStore.getState().reAuthRequired).toBe(true);
    expect(useSessionStore.getState().accessToken).toBeNull();
  });
});

describe("session store — refresh token rotation + revocation on logout", () => {
  let storage: ReturnType<typeof createRefreshTokenStorage>;
  beforeEach(() => {
    storage = createRefreshTokenStorage();
    reset(storage);
    useSessionStore.getState().setAdapter(siweLikeAdapter(storage));
  });

  it("refreshSession rotates the stored refresh token", async () => {
    await useSessionStore.getState().startSession(ADDR);
    expect(await storage.get()).toBe(`rt::${ADDR}`);

    await useSessionStore.getState().refreshSession();

    expect(await storage.get()).toBe(`rt::${ADDR}::rotated`);
    expect(useSessionStore.getState().accessToken).toBe("access::refreshed");
  });

  it("endSession revokes the refresh token (clears the dedicated store)", async () => {
    await useSessionStore.getState().startSession(ADDR);
    expect(await storage.get()).not.toBeNull();

    await useSessionStore.getState().endSession();

    expect(await storage.get()).toBeNull();
    expect(useSessionStore.getState().status).toBe("unauthenticated");
  });

  it("endSession clears the refresh store even when the adapter signOut throws", async () => {
    const fragile: SessionAdapter = {
      async signIn() {
        await storage.set("rt");
        return { accessToken: "a", expiresAt: Date.now() + 1000 };
      },
      async refresh() {
        return { accessToken: "a", expiresAt: Date.now() + 2000 };
      },
      async signOut() {
        throw new Error("network down");
      },
      async clearRefreshToken() {
        await storage.clear();
      },
    };
    useSessionStore.getState().setAdapter(fragile);
    await useSessionStore.getState().startSession(ADDR);
    await useSessionStore.getState().endSession();
    expect(await storage.get()).toBeNull();
  });
});
