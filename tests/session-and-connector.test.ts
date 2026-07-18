import { describe, it, expect, beforeEach, vi } from "vitest";
import { useSessionStore } from "../src/features/session/session.store";
import { SessionAdapter } from "../src/features/session/session.types";
import { noopSessionAdapter } from "../src/features/session/session.adapter";
import { createManualConnector, createWalletConnectConnector, isConnectorTypeSupported } from "../src/features/wallet/walletConnector.service";
import { createRefreshTokenStorage } from "../src/features/session/refreshTokenStorage";

const ADDR = "0x1234567890123456789012345678901234567890";

function resetSession() {
  useSessionStore.setState({
    status: "unauthenticated",
    walletAddress: null,
    accessToken: null,
    expiresAt: null,
    reAuthRequired: false,
    adapter: noopSessionAdapter,
  });
}

describe("Session store", () => {
  beforeEach(resetSession);

  it("starts unauthenticated", () => {
    expect(useSessionStore.getState().status).toBe("unauthenticated");
  });

  it("startSession transitions to authenticated via noop adapter", async () => {
    await useSessionStore.getState().startSession(ADDR);
    const { status, walletAddress, accessToken } = useSessionStore.getState();
    expect(status).toBe("authenticated");
    expect(walletAddress).toBe(ADDR);
    expect(accessToken).toMatch(/^noop:/);
  });

  it("startSession transitions to failed when adapter throws", async () => {
    const failingAdapter: SessionAdapter = {
      async signIn() {
        throw new Error("network error");
      },
      async refresh() {
        return { accessToken: "refreshed", expiresAt: 0 };
      },
      async signOut() {},
      async clearRefreshToken() {},
    };
    useSessionStore.getState().setAdapter(failingAdapter);
    await useSessionStore.getState().startSession(ADDR);
    expect(useSessionStore.getState().status).toBe("failed");
  });

  it("endSession resets to unauthenticated and clears tokens", async () => {
    await useSessionStore.getState().startSession(ADDR);
    await useSessionStore.getState().endSession();
    const { status, walletAddress, accessToken } = useSessionStore.getState();
    expect(status).toBe("unauthenticated");
    expect(walletAddress).toBeNull();
    expect(accessToken).toBeNull();
  });

  it("refreshSession updates the access token", async () => {
    const refreshAdapter: SessionAdapter = {
      async signIn() {
        return { accessToken: "initial", expiresAt: Date.now() + 1000 };
      },
      async refresh() {
        return { accessToken: "refreshed", expiresAt: Date.now() + 2000 };
      },
      async signOut() {},
      async clearRefreshToken() {},
    };
    useSessionStore.getState().setAdapter(refreshAdapter);
    await useSessionStore.getState().startSession(ADDR);
    await useSessionStore.getState().refreshSession();
    expect(useSessionStore.getState().accessToken).toBe("refreshed");
    expect(useSessionStore.getState().status).toBe("authenticated");
  });

  it("getValidAccessToken returns the token when fresh", async () => {
    await useSessionStore.getState().startSession(ADDR);
    expect(await useSessionStore.getState().getValidAccessToken()).toMatch(/^noop:/);
  });

  it("getValidAccessToken transparently refreshes an expired access token", async () => {
    const refreshAdapter: SessionAdapter = {
      async signIn() {
        return { accessToken: "initial", expiresAt: Date.now() - 1000 }; // already expired
      },
      async refresh() {
        return { accessToken: "refreshed", expiresAt: Date.now() + 60_000 };
      },
      async signOut() {},
      async clearRefreshToken() {},
    };
    useSessionStore.getState().setAdapter(refreshAdapter);
    await useSessionStore.getState().startSession(ADDR);
    expect(await useSessionStore.getState().getValidAccessToken()).toBe("refreshed");
  });

  it("refreshSession transitions to expired + reAuthRequired when adapter throws", async () => {
    const badRefreshAdapter: SessionAdapter = {
      async signIn() {
        return { accessToken: "tok", expiresAt: Date.now() + 1000 };
      },
      async refresh() {
        throw new Error("expired");
      },
      async signOut() {},
      async clearRefreshToken() {},
    };
    useSessionStore.getState().setAdapter(badRefreshAdapter);
    await useSessionStore.getState().startSession(ADDR);
    await useSessionStore.getState().refreshSession();
    const s = useSessionStore.getState();
    expect(s.status).toBe("expired");
    expect(s.reAuthRequired).toBe(true);
  });

  it("restoreSession sets authenticated when token is present and not expired", () => {
    useSessionStore.getState().restoreSession({
      walletAddress: ADDR,
      accessToken: "saved-token",
      expiresAt: Date.now() + 60_000,
    });
    expect(useSessionStore.getState().status).toBe("authenticated");
    expect(useSessionStore.getState().walletAddress).toBe(ADDR);
  });

  it("restoreSession sets unauthenticated when token is expired", () => {
    useSessionStore.getState().restoreSession({
      walletAddress: ADDR,
      accessToken: "old-token",
      expiresAt: Date.now() - 1000,
    });
    expect(useSessionStore.getState().status).toBe("unauthenticated");
  });
});

describe("Session store — refresh rotation + revocation on logout", () => {
  beforeEach(resetSession);

  /**
   * A SIWE-style adapter using an injected refresh-token store so we can assert
   * rotation and revocation at the store level (the security-critical criteria).
   */
  function siweLikeAdapter(storage: ReturnType<typeof createRefreshTokenStorage>, signer: (m: string) => Promise<string> = async () => "sig") {
    return {
      async signIn(address: string) {
        await storage.set(`refresh::${address}`);
        return { accessToken: `access::${address}`, expiresAt: Date.now() + 1000 };
      },
      async refresh() {
        const rt = await storage.get();
        if (!rt) throw new Error("NO_REFRESH_TOKEN");
        await storage.set(`${rt}::rotated`); // server rotates + invalidates old
        return { accessToken: `access::new`, expiresAt: Date.now() + 2000 };
      },
      async signOut() {
        const rt = await storage.get();
        if (rt) await storage.clear(); // revoke-on-logout
      },
      async clearRefreshToken() {
        await storage.clear();
      },
    } as SessionAdapter;
  }

  it("rotation persists a new refresh token after refreshSession", async () => {
    const storage = createRefreshTokenStorage();
    useSessionStore.getState().setAdapter(siweLikeAdapter(storage));

    await useSessionStore.getState().startSession(ADDR);
    expect(await storage.get()).toBe(`refresh::${ADDR}`);

    await useSessionStore.getState().refreshSession();
    expect(await storage.get()).toBe(`refresh::${ADDR}::rotated`);
    expect(useSessionStore.getState().accessToken).toBe("access::new");
  });

  it("endSession revokes the refresh token (clears the dedicated store)", async () => {
    const storage = createRefreshTokenStorage();
    useSessionStore.getState().setAdapter(siweLikeAdapter(storage));

    await useSessionStore.getState().startSession(ADDR);
    expect(await storage.get()).not.toBeNull();

    await useSessionStore.getState().endSession();
    expect(await storage.get()).toBeNull();
  });

  it("revocation is best-effort: logout clears storage even if signOut throws", async () => {
    const storage = createRefreshTokenStorage();
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

describe("noopSessionAdapter", () => {
  it("signIn returns a token scoped to the wallet address", async () => {
    const { accessToken, expiresAt } = await noopSessionAdapter.signIn(ADDR);
    expect(accessToken).toContain(ADDR);
    expect(expiresAt).toBeGreaterThan(Date.now());
  });

  it("refresh returns a token", async () => {
    const { accessToken } = await noopSessionAdapter.refresh();
    expect(accessToken).toMatch(/^noop:/);
  });

  it("signOut is a no-op (nothing to revoke)", async () => {
    await expect(noopSessionAdapter.signOut()).resolves.toBeUndefined();
  });
});

describe("WalletConnector — manual", () => {
  it("connect returns the address", async () => {
    const connector = createManualConnector(ADDR);
    const accounts = await connector.connect();
    expect(accounts).toEqual([ADDR]);
  });

  it("reconnect returns the address", async () => {
    const accounts = await createManualConnector(ADDR).reconnect();
    expect(accounts).toEqual([ADDR]);
  });

  it("getAccounts returns the address", async () => {
    const accounts = await createManualConnector(ADDR).getAccounts();
    expect(accounts).toEqual([ADDR]);
  });

  it("type is 'manual'", () => {
    expect(createManualConnector(ADDR).type).toBe("manual");
  });

  it("signMessage throws — a manually-entered address cannot prove ownership", async () => {
    await expect(createManualConnector(ADDR).signMessage("msg")).rejects.toThrow(/cannot sign/);
  });
});

describe("WalletConnector — walletconnect stub", () => {
  it("throws with helpful message when connect is called", () => {
    const connector = createWalletConnectConnector();
    expect(() => connector.connect()).toThrow("WalletConnect SDK not yet configured");
  });

  it("isConnectorTypeSupported returns true for walletconnect (stub registered)", () => {
    expect(isConnectorTypeSupported("walletconnect")).toBe(true);
  });

  it("isConnectorTypeSupported returns false for coinbase and metamask (not yet registered)", () => {
    expect(isConnectorTypeSupported("coinbase")).toBe(false);
    expect(isConnectorTypeSupported("metamask")).toBe(false);
  });
});
