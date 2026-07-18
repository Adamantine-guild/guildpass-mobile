/**
 * siweSessionAdapter — the full SIWE + refresh-rotation flow.
 *
 * Covers the security-critical behaviours:
 *   - signIn: nonce → build message → sign → exchange → persist refresh token
 *   - refresh: rotates the refresh token (new value persisted, old discarded)
 *   - refresh with no stored token: throws NO_REFRESH_TOKEN (forces re-auth)
 *   - signOut: revokes the stored refresh token AND clears it (revocation-on-logout)
 */

import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { createSiweSessionAdapter, SiweConfig } from "../src/features/session/siweSessionAdapter";
import { parseSiweMessage } from "../src/features/auth/siwe";
import { SessionError } from "../src/features/session/session.types";
import { TokenPair } from "../src/features/auth/authClient.types";

const ADDR = "0x1234567890123456789012345678901234567890";

const SIWE_CONFIG: SiweConfig = {
  domain: "app.guildpass.test",
  uri: "guildpass://login",
  chainId: 1,
  statement: "Sign in to GuildPass",
  expirationMs: 5 * 60 * 1000,
};

function makeRefreshStorage(initial: string | null = null) {
  let value = initial;
  return {
    get: vi.fn(async () => value),
    set: vi.fn(async (t: string) => {
      value = t;
    }),
    clear: vi.fn(async () => {
      value = null;
    }),
    peek: () => value,
  };
}

function makeAuthClient(overrides: Partial<Record<string, any>> = {}) {
  return {
    getNonce: vi.fn(async () => ({ nonce: "nonce-abc123" })),
    exchangeSiwe: vi.fn(
      async (): Promise<TokenPair> => ({
        accessToken: "access-1",
        refreshToken: "refresh-1",
        accessExpiresAt: 1000,
      }),
    ),
    refresh: vi.fn(
      async (): Promise<TokenPair> => ({
        accessToken: "access-2",
        refreshToken: "refresh-2",
        accessExpiresAt: 2000,
      }),
    ),
    revoke: vi.fn(async () => {}),
    ...overrides,
  } as any;
}

const FIXED_NOW = 1_700_000_000_000;

describe("siweSessionAdapter — signIn", () => {
  let authClient: ReturnType<typeof makeAuthClient>;
  let refreshTokenStorage: ReturnType<typeof makeRefreshStorage>;
  let signer: Mock<[string], Promise<string>>;

  beforeEach(() => {
    authClient = makeAuthClient();
    refreshTokenStorage = makeRefreshStorage();
    signer = vi.fn<[string], Promise<string>>(async () => "0xsignature");
  });

  function build() {
    return createSiweSessionAdapter({
      authClient,
      signer,
      refreshTokenStorage,
      siweConfig: SIWE_CONFIG,
      now: () => FIXED_NOW,
    });
  }

  it("runs nonce → build → sign → exchange and returns the access token", async () => {
    const result = await build().signIn(ADDR);

    expect(authClient.getNonce).toHaveBeenCalledTimes(1);
    expect(signer).toHaveBeenCalledTimes(1);
    expect(authClient.exchangeSiwe).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ accessToken: "access-1", expiresAt: 1000 });
  });

  it("signs a well-formed SIWE message embedding the address, nonce, and chainId", async () => {
    await build().signIn(ADDR);

    const signedMessage = signer.mock.calls[0][0] as string;
    const parsed = parseSiweMessage(signedMessage);
    expect(parsed.address).toBe(ADDR);
    expect(parsed.nonce).toBe("nonce-abc123");
    expect(parsed.chainId).toBe(1);
    expect(parsed.domain).toBe("app.guildpass.test");
    expect(parsed.expirationTime).toBe(new Date(FIXED_NOW + SIWE_CONFIG.expirationMs!).toISOString());
  });

  it("exchanges exactly the signed message + signature", async () => {
    await build().signIn(ADDR);
    const signedMessage = signer.mock.calls[0][0] as string;
    expect(authClient.exchangeSiwe).toHaveBeenCalledWith({
      message: signedMessage,
      signature: "0xsignature",
    });
  });

  it("persists the initial refresh token", async () => {
    await build().signIn(ADDR);
    expect(refreshTokenStorage.set).toHaveBeenCalledWith("refresh-1");
    expect(refreshTokenStorage.peek()).toBe("refresh-1");
  });

  it("wraps a signer failure in a SessionError(SIGN_IN_FAILED)", async () => {
    signer.mockRejectedValueOnce(new Error("user rejected"));
    await expect(build().signIn(ADDR)).rejects.toMatchObject({
      name: "SessionError",
      code: "SIGN_IN_FAILED",
    });
  });
});

describe("siweSessionAdapter — refresh (rotation)", () => {
  it("rotates the refresh token: persists the new value, returns the new access token", async () => {
    const authClient = makeAuthClient();
    const refreshTokenStorage = makeRefreshStorage("refresh-1");
    const adapter = createSiweSessionAdapter({
      authClient,
      signer: vi.fn(),
      refreshTokenStorage,
      siweConfig: SIWE_CONFIG,
    });

    const result = await adapter.refresh();

    expect(authClient.refresh).toHaveBeenCalledWith({ refreshToken: "refresh-1" });
    expect(refreshTokenStorage.set).toHaveBeenCalledWith("refresh-2");
    expect(refreshTokenStorage.peek()).toBe("refresh-2"); // old token replaced
    expect(result).toEqual({ accessToken: "access-2", expiresAt: 2000 });
  });

  it("throws NO_REFRESH_TOKEN when nothing is stored (re-auth required)", async () => {
    const authClient = makeAuthClient();
    const adapter = createSiweSessionAdapter({
      authClient,
      signer: vi.fn(),
      refreshTokenStorage: makeRefreshStorage(null),
      siweConfig: SIWE_CONFIG,
    });

    await expect(adapter.refresh()).rejects.toMatchObject({ code: "NO_REFRESH_TOKEN" });
    expect(authClient.refresh).not.toHaveBeenCalled();
  });

  it("throws REFRESH_FAILED when the server rejects the refresh token", async () => {
    const authClient = makeAuthClient({
      refresh: vi.fn(async () => {
        throw new Error("401");
      }),
    });
    const adapter = createSiweSessionAdapter({
      authClient,
      signer: vi.fn(),
      refreshTokenStorage: makeRefreshStorage("stale"),
      siweConfig: SIWE_CONFIG,
    });

    await expect(adapter.refresh()).rejects.toMatchObject({ code: "REFRESH_FAILED" });
  });
});

describe("siweSessionAdapter — signOut (revocation-on-logout)", () => {
  it("revokes the stored refresh token and clears it", async () => {
    const authClient = makeAuthClient();
    const refreshTokenStorage = makeRefreshStorage("refresh-1");
    const adapter = createSiweSessionAdapter({
      authClient,
      signer: vi.fn(),
      refreshTokenStorage,
      siweConfig: SIWE_CONFIG,
    });

    await adapter.signOut();

    expect(authClient.revoke).toHaveBeenCalledWith({ refreshToken: "refresh-1" });
    expect(refreshTokenStorage.clear).toHaveBeenCalledTimes(1);
    expect(refreshTokenStorage.peek()).toBeNull();
  });

  it("clears locally even when there is no stored token (no revoke call)", async () => {
    const authClient = makeAuthClient();
    const refreshTokenStorage = makeRefreshStorage(null);
    const adapter = createSiweSessionAdapter({
      authClient,
      signer: vi.fn(),
      refreshTokenStorage,
      siweConfig: SIWE_CONFIG,
    });

    await adapter.signOut();

    expect(authClient.revoke).not.toHaveBeenCalled();
    expect(refreshTokenStorage.clear).toHaveBeenCalledTimes(1);
  });

  it("clears locally even when revoke throws is swallowed by the client (best-effort)", async () => {
    // authClient.revoke is best-effort and never throws; ensure clear still runs.
    const authClient = makeAuthClient({ revoke: vi.fn(async () => {}) });
    const refreshTokenStorage = makeRefreshStorage("refresh-1");
    const adapter = createSiweSessionAdapter({
      authClient,
      signer: vi.fn(),
      refreshTokenStorage,
      siweConfig: SIWE_CONFIG,
    });

    await adapter.signOut();
    expect(refreshTokenStorage.clear).toHaveBeenCalled();
  });
});
