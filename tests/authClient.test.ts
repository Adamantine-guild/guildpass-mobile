/**
 * AuthClient — token-exchange contract tests.
 *
 * The transport is a mock `fetch`, so these assert the exact request paths,
 * methods, and bodies the backend must receive, and the exact response shape the
 * client accepts. No live backend.
 */

import { describe, it, expect, vi } from "vitest";
import { AuthClient } from "../src/features/auth/authClient";
import { AuthClientError, TokenPair } from "../src/features/auth/authClient.types";

const API = "https://api.guildpass.test";

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

const TOKEN_PAIR: TokenPair = {
  accessToken: "access-1",
  refreshToken: "refresh-1",
  accessExpiresAt: 1_700_000_000_000,
  refreshExpiresAt: 1_700_000_900_000,
};

describe("AuthClient — construction", () => {
  it("throws without an apiUrl", () => {
    expect(() => new AuthClient({ apiUrl: "", fetch: vi.fn() })).toThrow(/apiUrl/);
  });

  it("throws without a fetch implementation", () => {
    const savedFetch = (globalThis as any).fetch;
    (globalThis as any).fetch = undefined;
    try {
      expect(() => new AuthClient({ apiUrl: API })).toThrow(/fetch/);
    } finally {
      (globalThis as any).fetch = savedFetch;
    }
  });

  it("strips a trailing slash from apiUrl", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ nonce: "n" }));
    await new AuthClient({ apiUrl: `${API}/`, fetch: fetchMock }).getNonce();
    expect(fetchMock).toHaveBeenCalledWith(`${API}/auth/nonce`, expect.anything());
  });
});

describe("AuthClient — getNonce", () => {
  it("GETs /auth/nonce and returns the nonce", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ nonce: "abc12345" }));
    const client = new AuthClient({ apiUrl: API, fetch: fetchMock });
    const result = await client.getNonce();
    expect(result).toEqual({ nonce: "abc12345" });
    expect(fetchMock).toHaveBeenCalledWith(
      `${API}/auth/nonce`,
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("throws AuthClientError on non-2xx", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}, 500));
    const client = new AuthClient({ apiUrl: API, fetch: fetchMock });
    await expect(client.getNonce()).rejects.toBeInstanceOf(AuthClientError);
  });

  it("throws when the nonce is missing from a 2xx body", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}));
    const client = new AuthClient({ apiUrl: API, fetch: fetchMock });
    await expect(client.getNonce()).rejects.toThrow(/nonce/);
  });
});

describe("AuthClient — exchangeSiwe", () => {
  it("POSTs message + signature to /auth/siwe and returns a TokenPair", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(TOKEN_PAIR));
    const client = new AuthClient({ apiUrl: API, fetch: fetchMock });
    const result = await client.exchangeSiwe({ message: "MSG", signature: "0xsig" });

    expect(result).toEqual(TOKEN_PAIR);
    expect(fetchMock).toHaveBeenCalledWith(
      `${API}/auth/siwe`,
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ message: "MSG", signature: "0xsig" }),
      }),
    );
  });

  it("throws AuthClientError with status on 401", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}, 401));
    const client = new AuthClient({ apiUrl: API, fetch: fetchMock });
    await expect(client.exchangeSiwe({ message: "M", signature: "S" })).rejects.toMatchObject({
      status: 401,
    });
  });

  it("throws when token fields are missing", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ accessToken: "a" }));
    const client = new AuthClient({ apiUrl: API, fetch: fetchMock });
    await expect(client.exchangeSiwe({ message: "M", signature: "S" })).rejects.toThrow(/token/);
  });
});

describe("AuthClient — refresh (rotation)", () => {
  it("POSTs the refresh token and returns a rotated pair", async () => {
    const rotated: TokenPair = {
      accessToken: "access-2",
      refreshToken: "refresh-2",
      accessExpiresAt: 1_700_000_600_000,
    };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(rotated));
    const client = new AuthClient({ apiUrl: API, fetch: fetchMock });

    const result = await client.refresh({ refreshToken: "refresh-1" });

    expect(result.refreshToken).toBe("refresh-2");
    expect(result.refreshToken).not.toBe("refresh-1");
    expect(result.accessToken).toBe("access-2");
    expect(fetchMock).toHaveBeenCalledWith(
      `${API}/auth/refresh`,
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ refreshToken: "refresh-1" }),
      }),
    );
  });

  it("throws AuthClientError on a rejected (expired/reused) refresh token", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}, 401));
    const client = new AuthClient({ apiUrl: API, fetch: fetchMock });
    await expect(client.refresh({ refreshToken: "stale" })).rejects.toBeInstanceOf(AuthClientError);
  });
});

describe("AuthClient — revoke (logout)", () => {
  it("POSTs the refresh token to /auth/revoke", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}, 204));
    const client = new AuthClient({ apiUrl: API, fetch: fetchMock });
    await client.revoke({ refreshToken: "refresh-1" });
    expect(fetchMock).toHaveBeenCalledWith(
      `${API}/auth/revoke`,
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ refreshToken: "refresh-1" }),
      }),
    );
  });

  it("is best-effort — a network failure does not reject", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("network down"));
    const client = new AuthClient({ apiUrl: API, fetch: fetchMock });
    await expect(client.revoke({ refreshToken: "refresh-1" })).resolves.toBeUndefined();
  });
});
