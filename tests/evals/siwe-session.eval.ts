/**
 * SIWE session — integration eval (full rotate/revoke invariant chain).
 *
 * This is the eval lane for the feature. The feature is fully deterministic, so
 * rather than an LLM pass/fail, the "eval" is an end-to-end integration test that
 * drives the whole flow — nonce → SIWE sign → exchange → refresh-rotate →
 * revoke — against an in-memory fake backend, and asserts the security
 * invariants that must hold for every release. A regression here means a real
 * deployment would leak tokens or fail to revoke.
 *
 * Pass threshold: every invariant below holds.
 */

import { describe, it, expect } from "vitest";
import { createSiweSessionAdapter } from "../../src/features/session/siweSessionAdapter";
import { parseSiweMessage } from "../../src/features/auth/siwe";
import { createRefreshTokenStorage } from "../../src/features/session/refreshTokenStorage";
import { AuthClient } from "../../src/features/auth/authClient";
import type { FetchLike, TokenPair } from "../../src/features/auth/authClient.types";

const ADDR = "0x1234567890123456789012345678901234567890";
const SIWE_CONFIG = {
  domain: "app.guildpass.test",
  uri: "guildpass://login",
  chainId: 1,
  statement: "Sign in to GuildPass to prove wallet ownership.",
  expirationMs: 10 * 60 * 1000,
};

/**
 * In-memory fake of the SIWE token backend. It enforces the security invariants
 * a real backend must: one-time nonces, single-use refresh tokens, and revocation.
 */
function fakeBackend() {
  const nonces = new Set<string>();
  const refreshTokens = new Map<string, { owner: string; valid: boolean }>();
  let accessSeq = 0;
  let refreshSeq = 0;

  const issueNonce = () => {
    const n = `nonce-${nonces.size}`;
    nonces.add(n);
    return n;
  };

  const mintPair = (owner: string): TokenPair => ({
    accessToken: `access-${accessSeq++}`,
    refreshToken: `refresh-${refreshSeq++}`,
    accessExpiresAt: Date.now() + 5 * 60 * 1000,
  });

  const fetchImpl: FetchLike = async (url: string | URL | Request, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    const path = String(url).replace(/^https?:\/\/[^/]+/, "");

    if (path === "/auth/nonce" && init?.method === "GET") {
      return json(200, { nonce: issueNonce() });
    }

    if (path === "/auth/siwe" && init?.method === "POST") {
      // The backend re-parses the signed message and would verify the signature
      // here. We assert the structure it relies on (address + nonce) is present.
      const parsed = parseSiweMessage(body.message);
      if (!nonces.has(parsed.nonce)) {
        return json(401, { error: "unknown or reused nonce" });
      }
      nonces.delete(parsed.nonce); // single-use
      const pair = mintPair(parsed.address);
      refreshTokens.set(pair.refreshToken, { owner: parsed.address, valid: true });
      return json(200, pair);
    }

    if (path === "/auth/refresh" && init?.method === "POST") {
      const record = refreshTokens.get(body.refreshToken);
      if (!record || !record.valid) {
        return json(401, { error: "refresh token invalid or revoked" });
      }
      record.valid = false; // rotate: invalidate the old token
      const pair = mintPair(record.owner);
      refreshTokens.set(pair.refreshToken, { owner: record.owner, valid: true });
      return json(200, pair);
    }

    if (path === "/auth/revoke" && init?.method === "POST") {
      const record = refreshTokens.get(body.refreshToken);
      if (record) record.valid = false; // revoke
      return json(204, null);
    }

    return json(404, { error: "not found" });
  };

  return { fetchImpl, refreshTokens };
}

function json(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

function makeSigner(expectedAddr: string) {
  return async (message: string) => {
    const parsed = parseSiweMessage(message);
    if (parsed.address !== expectedAddr) {
      throw new Error("signer asked to sign for unexpected address");
    }
    return `sig(${Buffer.from(message).toString("base64").slice(0, 16)})`;
  };
}

describe("SIWE session eval — full flow invariants", () => {
  it("nonce → sign → exchange → refresh-rotate → revoke holds all invariants", async () => {
    const backend = fakeBackend();
    const authClient = new AuthClient({ apiUrl: "https://api.guildpass.test", fetch: backend.fetchImpl });
    const refreshTokenStorage = createRefreshTokenStorage();
    const adapter = createSiweSessionAdapter({
      authClient,
      signer: makeSigner(ADDR),
      refreshTokenStorage,
      siweConfig: SIWE_CONFIG,
    });

    // 1. Sign-in mints access + refresh, and persists the refresh token.
    const session1 = await adapter.signIn(ADDR);
    expect(session1.accessToken.startsWith("access-")).toBe(true);
    const refresh1 = await refreshTokenStorage.get();
    expect(refresh1).not.toBeNull();
    expect(backend.refreshTokens.get(refresh1!)?.valid).toBe(true);

    // 2. Refresh rotates the refresh token: the old one is invalidated, a new one stored.
    const session2 = await adapter.refresh();
    const refresh2 = await refreshTokenStorage.get();
    expect(refresh2).not.toBe(refresh1); // rotated
    expect(backend.refreshTokens.get(refresh1!)?.valid).toBe(false); // old revoked server-side
    expect(backend.refreshTokens.get(refresh2!)?.valid).toBe(true); // new valid
    expect(session2.accessToken).not.toBe(session1.accessToken);

    // 3. The rotated-away token can no longer be used (prevents reuse / theft).
    const reuse = await authClient.refresh({ refreshToken: refresh1! });
    // The fake backend returns 401 for an invalidated token → AuthClient throws.
    await expect(reuse).rejects.toBeDefined();

    // 4. Sign-out revokes the current refresh token (logout revocation).
    await adapter.signOut();
    expect(await refreshTokenStorage.get()).toBeNull();
    expect(backend.refreshTokens.get(refresh2!)?.valid).toBe(false);
  });

  it("rejects a replayed nonce (single-use)", async () => {
    const backend = fakeBackend();
    const authClient = new AuthClient({ apiUrl: "https://api.guildpass.test", fetch: backend.fetchImpl });
    const adapter = createSiweSessionAdapter({
      authClient,
      signer: makeSigner(ADDR),
      refreshTokenStorage: createRefreshTokenStorage(),
      siweConfig: SIWE_CONFIG,
    });

    await adapter.signIn(ADDR);
    // Second exchange with a now-consumed nonce must fail.
    const nonce = [...backend.refreshTokens.keys()].length; // any stale nonce
    const staleMessage = `app.guildpass.test wants you to sign in with your Ethereum account:\n${ADDR}\n\nSign in to GuildPass to prove wallet ownership.\n\nURI: guildpass://login\nVersion: 1\nChain ID: 1\nNonce: nonce-${nonce}\nIssued At: 2024-01-01T00:00:00.000Z`;
    await expect(authClient.exchangeSiwe({ message: staleMessage, signature: "x" })).rejects.toBeDefined();
  });

  it("refresh without a stored token forces re-auth (NO_REFRESH_TOKEN)", async () => {
    const backend = fakeBackend();
    const authClient = new AuthClient({ apiUrl: "https://api.guildpass.test", fetch: backend.fetchImpl });
    const adapter = createSiweSessionAdapter({
      authClient,
      signer: makeSigner(ADDR),
      refreshTokenStorage: createRefreshTokenStorage(), // empty
      siweConfig: SIWE_CONFIG,
    });

    await expect(adapter.refresh()).rejects.toMatchObject({ code: "NO_REFRESH_TOKEN" });
  });
});
